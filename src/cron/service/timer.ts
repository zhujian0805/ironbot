import type { CronJob } from "../types.ts";
import type { CronServiceState, CronEvent } from "./state.ts";
import { appendCronRunLog, resolveCronRunLogPath, type CronRunLogEntry } from "../run-log.ts";
import { locked } from "./locked.ts";
import { ensureLoaded, persist } from "./store.ts";
import { computeJobNextRunAtMs, nextWakeAtMs, isJobDue } from "./jobs.ts";

const formatMsIso = (ms?: number) =>
  typeof ms === "number" ? new Date(ms).toISOString() : undefined;

// Helper function to find job with a specific nextRunAtMs value
const findJobWithNextRunAt = (state: CronServiceState, targetTime: number) => {
  if (!state.store) return null;
  return state.store.jobs.find(job => job.state.nextRunAtMs === targetTime) || null;
};

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export function armTimer(state: CronServiceState) {
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = null;
  if (!state.deps.cronEnabled) {
    state.deps.log.info("cron: scheduler disabled, not arming timer");
    return;
  }

  // Always arm a periodic check timer to ensure jobs are regularly checked
  const REGULAR_CHECK_INTERVAL_MS = 30000; // 30 seconds - regular check for any due jobs
  const nextAt = nextWakeAtMs(state);

  // If there's a specific upcoming job that should run before the next regular check
  if (nextAt && nextAt < state.deps.nowMs() + REGULAR_CHECK_INTERVAL_MS) {
    const delay = Math.max(nextAt - state.deps.nowMs(), 0);
    const clampedDelay = Math.min(delay, REGULAR_CHECK_INTERVAL_MS);
    const nextRunTime = new Date(nextAt).toISOString();
    const targetJob = findJobWithNextRunAt(state, nextAt);
    state.deps.log.info(
      { nextRunAt: nextRunTime, delayMs: delay, clampedDelayMs: clampedDelay, jobId: targetJob?.id, jobName: targetJob?.name },
      "cron: arming timer for next specific job (sooner than regular check)"
    );
    state.timer = setTimeout(() => {
      state.deps.log.info("cron: timer triggered, processing due jobs");
      void onTimer(state).catch((err) => {
        state.deps.log.error({ err: String(err) }, "cron: timer tick failed");
      });
    }, clampedDelay);
  } else {
    // Otherwise, arm the regular check timer
    state.deps.log.info(
      { regularCheckIntervalMs: REGULAR_CHECK_INTERVAL_MS },
      "cron: arming regular check timer"
    );
    state.timer = setTimeout(() => {
      state.deps.log.info("cron: regular check timer triggered, processing due jobs");
      void onTimer(state).catch((err) => {
        state.deps.log.error({ err: String(err) }, "cron: timer tick failed");
      });
    }, REGULAR_CHECK_INTERVAL_MS);
  }

  state.timer.unref?.();
}

export async function onTimer(state: CronServiceState) {
  state.deps.log.debug("cron: timer callback initiated");
  if (state.running) {
    state.deps.log.warn("cron: timer tick skipped, previous execution still running");
    return;
  }
  state.running = true;
  try {
    await locked(state, async () => {
      state.deps.log.debug("cron: loading current store state");
      await ensureLoaded(state, { forceReload: true });

      // Check for and run any past-due jobs that may have been missed
      await runPastDueJobs(state);

      state.deps.log.debug("cron: checking for due jobs");
      await runDueJobs(state);
      state.deps.log.debug("cron: persisting updated store state");
      await persist(state);
      state.deps.log.debug("cron: rearming timer");
      armTimer(state);
    });
  } finally {
    state.running = false;
    state.deps.log.debug("cron: timer processing completed");
  }
}

export async function runDueJobs(state: CronServiceState) {
  if (!state.store) {
    state.deps.log.warn("cron: no store loaded, skipping due jobs check");
    return;
  }

  const now = state.deps.nowMs();
  const allJobsCount = state.store.jobs.length;
  state.deps.log.debug({ totalJobs: allJobsCount }, "cron: checking for due jobs");

  const due = state.store.jobs.filter((job) => {
    if (!job.enabled || job.state.runningAtMs) {
      return false;
    }
    const next = job.state.nextRunAtMs;
    return typeof next === "number" && now >= next;
  });

  state.deps.log.info(
    { dueJobs: due.length, totalJobs: allJobsCount },
    "cron: identified due jobs for execution"
  );

  for (const job of due) {
    const scheduledFor = formatMsIso(job.state.nextRunAtMs);
    const triggeredAt = new Date(now).toISOString();
    state.deps.log.info(
      {
        jobId: job.id,
        jobName: job.name,
        scheduleKind: job.schedule.kind,
        scheduledFor,
        triggeredAt,
      },
      "cron: executing due job"
    );
    await executeJob(state, job, now, { forced: false });
  }

  if (due.length > 0) {
    // Log details about which specific jobs were executed
    const executedJobDetails = due.map(job => ({
      id: job.id,
      name: job.name,
      schedule: job.schedule.kind
    }));
    state.deps.log.info({ executedJobs: executedJobDetails }, "cron: completed execution of due jobs");
  } else {
    state.deps.log.debug("cron: no jobs were due for execution");
  }
}

export async function runPastDueJobs(state: CronServiceState) {
  if (!state.store) {
    state.deps.log.warn("cron: no store loaded, skipping past-due jobs check");
    return;
  }

  const now = state.deps.nowMs();
  state.deps.log.debug("cron: checking for past-due jobs");

  // Find "at" jobs that were scheduled in the past but have no nextRunAtMs
  // (meaning their time has passed according to computeNextRunAtMs)
  const pastDueAtJobs = state.store.jobs.filter((job) => {
    // Look for enabled "at" jobs that would have run in the past but weren't executed
    if (!job.enabled || job.state.runningAtMs) {
      return false;
    }

    // If it's an "at" job and its scheduled time has passed but nextRunAtMs is undefined
    if (job.schedule.kind === "at") {
      const scheduledTime = new Date(job.schedule.at).getTime();
      const isPastDue = scheduledTime <= now;
      const hasNoFutureRun = job.state.nextRunAtMs === undefined;

      if (isPastDue && hasNoFutureRun) {
        state.deps.log.info(
          {
            jobId: job.id,
            jobName: job.name,
            scheduledAt: new Date(scheduledTime).toISOString(),
            now: new Date(now).toISOString()
          },
          "cron: detected past-due 'at' job"
        );
        return true;
      }
    }

    return false;
  });

  for (const job of pastDueAtJobs) {
    state.deps.log.info(
      { jobId: job.id, jobName: job.name },
      "cron: executing past-due 'at' job"
    );
    await executeJob(state, job, now, { forced: false });
  }

  if (pastDueAtJobs.length > 0) {
    state.deps.log.info({ executedJobs: pastDueAtJobs.length }, "cron: completed execution of past-due jobs");
  } else {
    state.deps.log.debug("cron: no past-due jobs found");
  }
}

export async function executeJob(
  state: CronServiceState,
  job: CronJob,
  nowMs: number,
  opts: { forced: boolean },
) {
  const startedAt = state.deps.nowMs();
  const scheduledFor = formatMsIso(job.state.nextRunAtMs);
  state.deps.log.info(
    {
      jobId: job.id,
      jobName: job.name,
      channel: job.payload.channel,
      scheduleKind: job.schedule.kind,
      executionType: 'type' in job.payload && job.payload.type === 'direct-execution' ? 'direct-tool-execution' : 'slack-message',
      scheduledFor,
      startedAt: new Date(startedAt).toISOString(),
    },
    "cron: starting job execution"
  );

  job.state.runningAtMs = startedAt;
  job.state.lastError = undefined;
  emit(state, { jobId: job.id, action: "started", runAtMs: startedAt });

  let deleted = false;

  const finish = async (status: "ok" | "error" | "skipped", err?: string, summary?: string) => {
    const endedAt = state.deps.nowMs();
    job.state.runningAtMs = undefined;
    job.state.lastRunAtMs = startedAt;
    job.state.lastStatus = status;
    job.state.lastDurationMs = Math.max(0, endedAt - startedAt);
    job.state.lastError = err;
    job.updatedAtMs = nowMs;

    state.deps.log.info(
      {
        jobId: job.id,
        jobName: job.name,
        status,
        durationMs: job.state.lastDurationMs,
        error: err,
        scheduleKind: job.schedule.kind,
        executionType: 'type' in job.payload && job.payload.type === 'direct-execution' ? 'direct-tool-execution' : 'slack-message'
      },
      "cron: job execution completed"
    );

    const shouldDelete =
      job.schedule.kind === "at" && status === "ok" && job.deleteAfterRun === true;

    if (!shouldDelete) {
      if (job.schedule.kind === "at" && status === "ok") {
        job.enabled = false;
        job.state.nextRunAtMs = undefined;
        state.deps.log.info(
          { jobId: job.id, jobName: job.name },
          "cron: disabling one-time job after successful execution"
        );
      } else if (job.enabled) {
        job.state.nextRunAtMs = computeJobNextRunAtMs(job, endedAt);
        state.deps.log.info(
          { jobId: job.id, jobName: job.name, nextRunAtMs: job.state.nextRunAtMs },
          "cron: calculated next run time for job"
        );
      } else {
        job.state.nextRunAtMs = undefined;
      }
    }

    emit(state, {
      jobId: job.id,
      action: "finished",
      status,
      error: err,
      summary,
      runAtMs: startedAt,
      durationMs: job.state.lastDurationMs,
      nextRunAtMs: job.state.nextRunAtMs,
    });

    const logPath = resolveCronRunLogPath({
      storePath: state.deps.storePath,
      jobId: job.id,
    });
    const logEntry: CronRunLogEntry = {
      ts: Date.now(),
      jobId: job.id,
      action: "finished",
      status,
      error: err,
      summary,
      runAtMs: startedAt,
      durationMs: job.state.lastDurationMs,
      nextRunAtMs: job.state.nextRunAtMs,
    };

    state.deps.log.debug(
      { jobId: job.id, logPath },
      "cron: appending run log entry"
    );

    void appendCronRunLog(logPath, logEntry).catch((logErr) => {
      state.deps.log.warn(
        { jobId: job.id, err: String(logErr) },
        "cron: failed to append run log",
      );
    });

    await reportJobRunStatus(state, job, status, err ?? summary);

    if (shouldDelete && state.store) {
      state.store.jobs = state.store.jobs.filter((j) => j.id !== job.id);
      deleted = true;
      state.deps.log.info(
        { jobId: job.id, jobName: job.name },
        "cron: deleted one-time job after successful execution"
      );
      emit(state, { jobId: job.id, action: "removed" });
    }
  };

  try {
    // Determine if this is a direct execution or a Slack message
    if ('type' in job.payload && job.payload.type === 'direct-execution') {
      // Direct execution mode
      state.deps.log.info(
        { jobId: job.id, toolName: job.payload.toolName, params: job.payload.toolParams },
        "cron: executing tool directly"
      );

      if (!state.deps.executeTool) {
        throw new Error('Direct execution is not supported - executeTool dependency not provided');
      }

      // Execute the tool and capture the result
      const result = await state.deps.executeTool(job.payload.toolName, job.payload.toolParams);
      state.deps.log.info(
        { jobId: job.id, toolName: job.payload.toolName },
        "cron: tool execution completed successfully"
      );

      // Log more details for debugging
      state.deps.log.debug(
        {
          jobId: job.id,
          jobName: job.name,
          toolName: job.payload.toolName,
          command: job.payload.toolParams.command
        },
        "cron: direct execution job details"
      );

      await finish("ok", undefined, `executed tool: ${job.payload.toolName}`);
    } else {
      // Slack message mode (existing behavior)
      state.deps.log.info(
        { jobId: job.id, channel: job.payload.channel, message: job.payload.text },
        "cron: sending scheduled message to Slack"
      );

      await state.deps.sendMessage(job.payload);
      await finish("ok", undefined, job.payload.text);
    }
  } catch (err) {
    state.deps.log.error(
      { jobId: job.id, error: String(err) },
      "cron: job execution failed"
    );
    await finish("error", String(err));
  } finally {
    if (!opts.forced && job.enabled && !deleted) {
      job.state.nextRunAtMs = computeJobNextRunAtMs(job, state.deps.nowMs());
      state.deps.log.debug(
        { jobId: job.id, nextRunAtMs: job.state.nextRunAtMs },
        "cron: recomputed next run time after execution"
      );
    }
  }
}

export function stopTimer(state: CronServiceState) {
  if (state.timer) {
    state.deps.log.info("cron: stopping timer");
    clearTimeout(state.timer);
  }
  state.timer = null;
  state.deps.log.info("cron: timer stopped");
}

export function emit(state: CronServiceState, evt: CronEvent) {
  state.deps.log.debug({ event: evt }, "cron: emitting event");
  try {
    state.deps.onEvent?.(evt);
  } catch {
    // ignore
  }
}

async function reportJobRunStatus(
  state: CronServiceState,
  job: CronJob,
  status: "ok" | "error" | "skipped",
  detail?: string,
) {
  const channel = job.payload.channel;
  if (!channel) {
    return;
  }
  const action =
    status === "ok"
      ? "completed successfully"
      : status === "skipped"
        ? "was skipped"
        : "failed";
  const detailText = detail ? `: ${detail}` : "";
  const nextRunLabel = job.state.nextRunAtMs
    ? new Date(job.state.nextRunAtMs).toISOString()
    : "none";
  const message = `Cron job "${job.name}" ${action}${detailText}. Next run: ${nextRunLabel}.`;

  const payload = {
    channel,
    text: message,
    threadTs: job.payload.threadTs,
    replyBroadcast: job.payload.replyBroadcast ?? false,
  };
  try {
    state.deps.log.debug(
      { jobId: job.id, jobName: job.name, channel, status },
      "cron: sending status update to Slack"
    );
    await state.deps.sendMessage(payload);
    state.deps.log.info(
      { jobId: job.id, jobName: job.name, channel, status },
      "cron: status update sent to Slack"
    );
  } catch (error) {
    state.deps.log.warn({ jobId: job.id, err: String(error) }, "cron: failed to report job run status");
  }
}
