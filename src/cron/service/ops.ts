import type { CronJobCreate, CronJobPatch } from "../types.ts";
import type { CronServiceState } from "./state.ts";
import {
  applyJobPatch,
  computeJobNextRunAtMs,
  createJob,
  ensureUniqueJobName,
  findJobOrThrow,
  isJobDue,
  nextWakeAtMs,
} from "./jobs.ts";
import { locked } from "./locked.ts";
import { ensureLoaded, persist, warnIfDisabled } from "./store.ts";
import { armTimer, executeJob, emit, runDueJobs, runPastDueJobs, stopTimer } from "./timer.ts";

const formatNextRunAt = (ms?: number) =>
  typeof ms === "number" ? new Date(ms).toISOString() : undefined;

export async function start(state: CronServiceState) {
  await locked(state, async () => {
    if (!state.deps.cronEnabled) {
      state.deps.log.info({ enabled: false }, "cron: scheduler disabled");
      return;
    }
    state.deps.log.info("cron: starting scheduler service");
    await ensureLoaded(state);

    // Check for and execute any past-due jobs immediately at startup
    state.deps.log.info("cron: checking for past-due jobs at startup");
    await runPastDueJobs(state);
    await persist(state); // Persist any changes made during past-due job processing

    armTimer(state);
    state.deps.log.info(
      {
        enabled: true,
        jobs: state.store?.jobs.length ?? 0,
        nextWakeAtMs: nextWakeAtMs(state) ?? null,
      },
      "cron: started scheduler service",
    );
  });
}

export function stop(state: CronServiceState) {
  stopTimer(state);
}

export async function status(state: CronServiceState) {
  return await locked(state, async () => {
    await ensureLoaded(state);
    return {
      enabled: state.deps.cronEnabled,
      storePath: state.deps.storePath,
      jobs: state.store?.jobs.length ?? 0,
      nextWakeAtMs: state.deps.cronEnabled ? (nextWakeAtMs(state) ?? null) : null,
    };
  });
}

export async function list(state: CronServiceState) {
  return await locked(state, async () => {
    await ensureLoaded(state);
    const jobCount = state.store?.jobs.length ?? 0;
    state.deps.log.info({ jobCount }, "cron: returning list of jobs");
    return state.store?.jobs ?? [];
  });
}

export async function add(state: CronServiceState, input: CronJobCreate) {
  return await locked(state, async () => {
    warnIfDisabled(state, "add");
    state.deps.log.info(
      { jobName: input.name, schedule: input.schedule },
      "cron: adding new job"
    );
    await ensureLoaded(state);
    if (!state.store) {
      state.deps.log.debug("cron: initializing empty store");
      state.store = { version: 1, jobs: [] };
    }

    // Ensure the job name is unique
    const uniqueName = ensureUniqueJobName(state, input.name);
    const inputWithUniqueName = { ...input, name: uniqueName };

    const now = state.deps.nowMs();
    const job = createJob(inputWithUniqueName, now);
    state.store.jobs.push(job);
    await persist(state);
    state.deps.log.info(
      {
        jobId: job.id,
        jobName: job.name,
        scheduleKind: job.schedule.kind,
        nextRunAt: formatNextRunAt(job.state.nextRunAtMs),
      },
      "cron: job added and persisted"
    );
    armTimer(state);
    emit(state, { jobId: job.id, action: "added", nextRunAtMs: job.state.nextRunAtMs });
    return job;
  });
}

export async function update(state: CronServiceState, id: string, patch: CronJobPatch) {
  return await locked(state, async () => {
    warnIfDisabled(state, "update");
    state.deps.log.info(
      { jobId: id, patch },
      "cron: updating job"
    );
    await ensureLoaded(state);
    const job = findJobOrThrow(state, id);
    const now = state.deps.nowMs();
    applyJobPatch(job, patch, now);
    await persist(state);
    state.deps.log.info(
      {
        jobId: id,
        jobName: job.name,
        scheduleKind: job.schedule.kind,
        nextRunAt: formatNextRunAt(job.state.nextRunAtMs),
      },
      "cron: job updated and persisted"
    );
    armTimer(state);
    emit(state, { jobId: job.id, action: "updated", nextRunAtMs: job.state.nextRunAtMs });
    return job;
  });
}

export async function remove(state: CronServiceState, id: string) {
  return await locked(state, async () => {
    warnIfDisabled(state, "remove");
    state.deps.log.info(
      { jobId: id },
      "cron: removing job"
    );
    await ensureLoaded(state);
    if (!state.store) {
      state.deps.log.warn({ jobId: id }, "cron: no store found when attempting to remove job");
      return { ok: false, removed: false } as const;
    }
    const before = state.store.jobs.length;
    state.store.jobs = state.store.jobs.filter((job) => job.id !== id);
    const removed = state.store.jobs.length < before;
    await persist(state);
    if (removed) {
      state.deps.log.info(
        { jobId: id },
        "cron: job removed and persisted"
      );
    } else {
      state.deps.log.warn(
        { jobId: id },
        "cron: attempted to remove non-existent job"
      );
    }
    armTimer(state);
    if (removed) {
      emit(state, { jobId: id, action: "removed" });
    }
    return { ok: true, removed } as const;
  });
}

export async function run(state: CronServiceState, id: string, forced = false) {
  return await locked(state, async () => {
    warnIfDisabled(state, "run");
    state.deps.log.info(
      { jobId: id, forced },
      "cron: running job"
    );
    await ensureLoaded(state);
    const job = findJobOrThrow(state, id);
    const now = state.deps.nowMs();
    if (!isJobDue(job, now, { forced })) {
      state.deps.log.info(
        { jobId: id, jobName: job.name },
        "cron: job not due, skipping execution"
      );
      return { ok: true, ran: false, reason: "not-due" as const };
    }
    state.deps.log.info(
      { jobId: id, jobName: job.name },
      "cron: executing job now"
    );
    await executeJob(state, job, now, { forced });
    await persist(state);
    armTimer(state);
    state.deps.log.info(
      { jobId: id, jobName: job.name },
      "cron: job execution completed and persisted"
    );
    return { ok: true, ran: true } as const;
  });
}
