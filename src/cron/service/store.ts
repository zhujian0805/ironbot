import type { CronServiceState } from "./state.ts";
import { loadCronStore, saveCronStore } from "../store.ts";
import { recomputeNextRuns } from "./jobs.ts";

export async function ensureLoaded(state: CronServiceState, opts?: { forceReload?: boolean }) {
  if (state.store && !opts?.forceReload) {
    return;
  }
  const loaded = await loadCronStore(state.deps.storePath);
  state.store = loaded;
  recomputeNextRuns(state);
}

export async function persist(state: CronServiceState) {
  if (!state.store) {
    return;
  }
  await saveCronStore(state.deps.storePath, state.store);
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
}
