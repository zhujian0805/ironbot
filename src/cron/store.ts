import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CronJob, CronStoreFile } from "./types.ts";
import { resolveStateDir, resolveUserPath } from "../sessions/paths.ts";

export const DEFAULT_CRON_DIR = path.join(resolveStateDir(), "cron");
export const DEFAULT_CRON_STORE_PATH = path.join(DEFAULT_CRON_DIR, "jobs.json");

export function resolveCronStorePath(storePath?: string) {
  if (storePath?.trim()) {
    const raw = storePath.trim();
    if (raw.startsWith("~")) {
      return resolveUserPath(raw);
    }
    return path.resolve(raw);
  }
  return DEFAULT_CRON_STORE_PATH;
}

export async function loadCronStore(storePath: string): Promise<CronStoreFile> {
  try {
    const raw = await fs.promises.readFile(storePath, "utf-8");
    const parsed = JSON.parse(raw);
    const jobs = Array.isArray(parsed?.jobs) ? parsed?.jobs : [];
    console.log(`Loaded cron store from ${storePath} with ${jobs.length} jobs`);
    return {
      version: 1,
      jobs: jobs.filter(Boolean) as CronJob[],
    };
  } catch (error) {
    console.log(`Could not load cron store from ${storePath}, creating empty store:`, (error as Error).message);
    return { version: 1, jobs: [] };
  }
}

export async function saveCronStore(storePath: string, store: CronStoreFile) {
  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
  const tmp = `${storePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  const json = JSON.stringify(store, null, 2);
  await fs.promises.writeFile(tmp, json, "utf-8");
  await fs.promises.rename(tmp, storePath);
  console.log(`Saved cron store to ${storePath} with ${store.jobs.length} jobs`);
  try {
    await fs.promises.copyFile(storePath, `${storePath}.bak`);
  } catch {
    // ignore
  }
}
