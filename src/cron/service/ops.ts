import type { CronJobCreate, CronJobPatch } from "../types.ts";
import type { CronServiceState } from "./state.ts";
import {
  applyJobPatch,
  computeJobNextRunAtMs,
  createJob,
  findJobOrThrow,
  isJobDue,
  nextWakeAtMs,
} from "./jobs.ts";
import { locked } from "./locked.ts";
import { ensureLoaded, persist, warnIfDisabled } from "./store.ts";
import { armTimer, executeJob, emit, runDueJobs, stopTimer } from "./timer.ts";

export async function start(state: CronServiceState) {
  await locked(state, async () => {
    if (!state.deps.cronEnabled) {
      state.deps.log.info({ enabled: false }, "cron: disabled");
      return;
    }
    await ensureLoaded(state);
    armTimer(state);
    state.deps.log.info(
      {
        enabled: true,
        jobs: state.store?.jobs.length ?? 0,
        nextWakeAtMs: nextWakeAtMs(state) ?? null,
      },
      "cron: started",
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
    return state.store?.jobs ?? [];
  });
}

export async function add(state: CronServiceState, input: CronJobCreate) {
  return await locked(state, async () => {
    warnIfDisabled(state, "add");
    await ensureLoaded(state);
    if (!state.store) {
      state.store = { version: 1, jobs: [] };
    }
    const now = state.deps.nowMs();
    const job = createJob(input, now);
    state.store.jobs.push(job);
    await persist(state);
    armTimer(state);
    emit(state, { jobId: job.id, action: "added", nextRunAtMs: job.state.nextRunAtMs });
    return job;
  });
}

export async function update(state: CronServiceState, id: string, patch: CronJobPatch) {
  return await locked(state, async () => {
    warnIfDisabled(state, "update");
    await ensureLoaded(state);
    const job = findJobOrThrow(state, id);
    const now = state.deps.nowMs();
    applyJobPatch(job, patch, now);
    await persist(state);
    armTimer(state);
    emit(state, { jobId: job.id, action: "updated", nextRunAtMs: job.state.nextRunAtMs });
    return job;
  });
}

export async function remove(state: CronServiceState, id: string) {
  return await locked(state, async () => {
    warnIfDisabled(state, "remove");
    await ensureLoaded(state);
    if (!state.store) {
      return { ok: false, removed: false } as const;
    }
    const before = state.store.jobs.length;
    state.store.jobs = state.store.jobs.filter((job) => job.id !== id);
    const removed = state.store.jobs.length < before;
    await persist(state);
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
    await ensureLoaded(state);
    const job = findJobOrThrow(state, id);
    const now = state.deps.nowMs();
    if (!isJobDue(job, now, { forced })) {
      return { ok: true, ran: false, reason: "not-due" as const };
    }
    await executeJob(state, job, now, { forced });
    await persist(state);
    armTimer(state);
    return { ok: true, ran: true } as const;
  });
}
