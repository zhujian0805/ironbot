import type { CronJob } from "../types.ts";
import type { CronServiceState, CronEvent } from "./state.ts";
import { appendCronRunLog, resolveCronRunLogPath, type CronRunLogEntry } from "../run-log.ts";
import { locked } from "./locked.ts";
import { ensureLoaded, persist } from "./store.ts";
import { computeJobNextRunAtMs, nextWakeAtMs, isJobDue } from "./jobs.ts";

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export function armTimer(state: CronServiceState) {
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = null;
  if (!state.deps.cronEnabled) {
    return;
  }
  const nextAt = nextWakeAtMs(state);
  if (!nextAt) {
    return;
  }
  const delay = Math.max(nextAt - state.deps.nowMs(), 0);
  const clampedDelay = Math.min(delay, MAX_TIMEOUT_MS);
  state.timer = setTimeout(() => {
    void onTimer(state).catch((err) => {
      state.deps.log.error({ err: String(err) }, "cron: timer tick failed");
    });
  }, clampedDelay);
  state.timer.unref?.();
}

export async function onTimer(state: CronServiceState) {
  if (state.running) {
    return;
  }
  state.running = true;
  try {
    await locked(state, async () => {
      await ensureLoaded(state, { forceReload: true });
      await runDueJobs(state);
      await persist(state);
      armTimer(state);
    });
  } finally {
    state.running = false;
  }
}

export async function runDueJobs(state: CronServiceState) {
  if (!state.store) {
    return;
  }
  const now = state.deps.nowMs();
  const due = state.store.jobs.filter((job) => {
    if (!job.enabled || job.state.runningAtMs) {
      return false;
    }
    const next = job.state.nextRunAtMs;
    return typeof next === "number" && now >= next;
  });
  for (const job of due) {
    await executeJob(state, job, now, { forced: false });
  }
}

export async function executeJob(
  state: CronServiceState,
  job: CronJob,
  nowMs: number,
  opts: { forced: boolean },
) {
  const startedAt = state.deps.nowMs();
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

    const shouldDelete =
      job.schedule.kind === "at" && status === "ok" && job.deleteAfterRun === true;

    if (!shouldDelete) {
      if (job.schedule.kind === "at" && status === "ok") {
        job.enabled = false;
        job.state.nextRunAtMs = undefined;
      } else if (job.enabled) {
        job.state.nextRunAtMs = computeJobNextRunAtMs(job, endedAt);
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
      emit(state, { jobId: job.id, action: "removed" });
    }
  };

  try {
    await state.deps.sendMessage(job.payload);
    await finish("ok", undefined, job.payload.text);
  } catch (err) {
    await finish("error", String(err));
  } finally {
    if (!opts.forced && job.enabled && !deleted) {
      job.state.nextRunAtMs = computeJobNextRunAtMs(job, state.deps.nowMs());
    }
  }
}

export function stopTimer(state: CronServiceState) {
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = null;
}

export function emit(state: CronServiceState, evt: CronEvent) {
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
    await state.deps.sendMessage(payload);
  } catch (error) {
    state.deps.log.warn({ jobId: job.id, err: String(error) }, "cron: failed to report job run status");
  }
}
