import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";

import type { CronJob } from "../../../src/cron/types.ts";
import { ensureJobInStore } from "../../../src/cron/store_verification.ts";

describe("store verification", () => {
  const createdDirs: string[] = [];

  const createStore = async (jobs: Array<unknown>) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ironbot-cron-store-"));
    createdDirs.push(tempDir);
    const storePath = path.join(tempDir, "jobs.json");
    await fs.writeFile(storePath, JSON.stringify({ version: 1, jobs }, null, 2), "utf-8");
    return storePath;
  };

  it("returns the job when the id exists", async () => {
    const job: CronJob = {
      id: "job-found",
      name: "found",
      enabled: true,
      createdAtMs: 1,
      updatedAtMs: 1,
      schedule: { kind: "at", at: new Date().toISOString() },
      payload: { channel: "C123", text: "hello" },
      state: {},
    };
    const storePath = await createStore([job]);

    const result = await ensureJobInStore(storePath, "job-found");
    expect(result).toMatchObject(job);
  });

  it("throws when the job id is missing", async () => {
    const storePath = await createStore([]);
    await expect(ensureJobInStore(storePath, "missing")).rejects.toThrow(/missing/);
  });

  afterAll(async () => {
    await Promise.all(createdDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });
});
