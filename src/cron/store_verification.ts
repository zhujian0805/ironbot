import { loadCronStore } from "./store.ts";
import type { CronJob } from "./types.ts";

export async function ensureJobInStore(storePath: string, jobId: string): Promise<CronJob> {
  const store = await loadCronStore(storePath);
  const job = store.jobs.find((entry) => entry.id === jobId);
  if (!job) {
    throw new Error(`Cron job ${jobId} was not found in ${storePath}`);
  }
  return job;
}
