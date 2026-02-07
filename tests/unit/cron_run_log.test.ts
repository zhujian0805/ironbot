import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";

import {
  appendCronRunLog,
  readCronRunLogEntries,
  resolveCronRunLogPath,
} from "../../src/cron/run-log.ts";

const createTempStorePath = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ironbot-cron-run-log-"));
  return { dir, storePath: path.join(dir, "jobs.json") };
};

describe("cron run log", () => {
  it("appends entries in chronological order", async () => {
    const { dir, storePath } = await createTempStorePath();
    try {
      const logPath = resolveCronRunLogPath({ storePath, jobId: "job-1" });
      const entries = [
        { ts: 1, jobId: "job-1", action: "finished", status: "ok", runAtMs: 1, durationMs: 10 },
        { ts: 2, jobId: "job-1", action: "finished", status: "skipped", runAtMs: 2, durationMs: 5 },
        { ts: 3, jobId: "job-1", action: "finished", status: "error", runAtMs: 3, durationMs: 20 },
      ];
      for (const entry of entries) {
        await appendCronRunLog(logPath, entry);
      }
      const read = await readCronRunLogEntries(logPath, { limit: 10, jobId: "job-1" });
      expect(read).toHaveLength(entries.length);
      expect(read.map((entry) => entry.ts)).toEqual([1, 2, 3]);
      expect(read.map((entry) => entry.status)).toEqual(["ok", "skipped", "error"]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("prunes old entries when outside keepLines", async () => {
    const { dir, storePath } = await createTempStorePath();
    try {
      const logPath = resolveCronRunLogPath({ storePath, jobId: "job-2" });
      const entries = [
        { ts: 1, jobId: "job-2", action: "finished" },
        { ts: 2, jobId: "job-2", action: "finished" },
        { ts: 3, jobId: "job-2", action: "finished" },
        { ts: 4, jobId: "job-2", action: "finished" },
      ];
      for (const entry of entries) {
        await appendCronRunLog(logPath, entry, { maxBytes: 1, keepLines: 2 });
      }
      const read = await readCronRunLogEntries(logPath, { jobId: "job-2", limit: 10 });
      expect(read).toHaveLength(2);
      expect(read.map((entry) => entry.ts)).toEqual([3, 4]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
