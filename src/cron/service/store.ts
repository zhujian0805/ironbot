import type { CronServiceState } from "./state.ts";
import { loadCronStore, saveCronStore } from "../store.ts";
import { recomputeNextRuns } from "./jobs.ts";

export async function ensureLoaded(state: CronServiceState, opts?: { forceReload?: boolean }) {
  if (state.store && !opts?.forceReload) {
    return;
  }
  state.deps.log.debug(
    { storePath: state.deps.storePath, forceReload: opts?.forceReload },
    "cron: loading store from disk"
  );
  const loaded = await loadCronStore(state.deps.storePath);
  state.store = loaded;
  state.deps.log.info(
    { jobCount: loaded.jobs.length, storePath: state.deps.storePath },
    "cron: loaded store from disk"
  );
  recomputeNextRuns(state);
}

export async function persist(state: CronServiceState) {
  if (!state.store) {
    state.deps.log.warn("cron: no store to persist");
    return;
  }
  state.deps.log.debug(
    { jobCount: state.store.jobs.length, storePath: state.deps.storePath },
    "cron: persisting store to disk"
  );
  await saveCronStore(state.deps.storePath, state.store);
  state.deps.log.info(
    { jobCount: state.store.jobs.length, storePath: state.deps.storePath },
    "cron: store persisted to disk"
  );
}

export function warnIfDisabled(state: CronServiceState, action: string) {
  if (state.deps.cronEnabled) {
    return;
  }
  if (state.warnedDisabled) {
    return;
  }
  state.warnedDisabled = true;
  state.deps.log.warn(
    { enabled: false, action, storePath: state.deps.storePath },
    "cron: scheduler disabled; jobs will not run automatically",
  );
  console.log("Cron scheduler is disabled; jobs will not run automatically");
}
