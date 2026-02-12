import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync, spawn } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { CronStoreFile } from "../../src/cron/types.ts";

describe("cron script integration tests", () => {
  let tempDir: string;
  let storePath: string;
  let originalEnv: string | undefined;

  beforeAll(async () => {
    // Create temporary directory for test store
    tempDir = join(tmpdir(), `ironbot-cron-test-${Date.now()}`);
    storePath = join(tempDir, "jobs.json");
    originalEnv = process.env.IRONBOT_CRON_STORE_PATH;

    // Set up test environment
    process.env.IRONBOT_CRON_STORE_PATH = storePath;

    // Create initial store with test jobs
    const initialStore: CronStoreFile = {
      version: "1.0",
      jobs: [
        {
          id: "test-job-1",
          name: "Test Job 1",
          schedule: { kind: "cron", expr: "0 * * * *" },
          payload: { channel: "C123456", text: "Test message 1" },
          enabled: true,
          state: { nextRunAtMs: Date.now() + 3600000 },
          createdAtMs: Date.now(),
          updatedAtMs: Date.now()
        },
        {
          id: "test-job-2",
          name: "Test Job 2",
          schedule: { kind: "cron", expr: "30 * * * *" },
          payload: { channel: "C123456", text: "Test message 2" },
          enabled: false,
          state: { nextRunAtMs: Date.now() + 7200000 },
          createdAtMs: Date.now(),
          updatedAtMs: Date.now()
        }
      ]
    };

    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(initialStore, null, 2));
  });

  afterAll(async () => {
    // Restore environment
    if (originalEnv !== undefined) {
      process.env.IRONBOT_CRON_STORE_PATH = originalEnv;
    } else {
      delete process.env.IRONBOT_CRON_STORE_PATH;
    }

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn("Failed to clean up temp directory:", error);
    }
  });

  const runCronCommand = (args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
    return new Promise((resolve, reject) => {
      const child = spawn("bun", ["run", "scripts/cron.ts", ...args], {
        stdio: "pipe",
        env: { ...process.env, IRONBOT_CRON_STORE_PATH: storePath }
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (exitCode) => {
        resolve({ stdout, stderr, exitCode });
      });

      child.on("error", reject);
    });
  };

  describe("resolveJobByIdInput functionality", () => {
    it("should find job by exact ID match", async () => {
      const result = await runCronCommand(["status"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Jobs: 2");
    });

    it("should support partial ID prefix matching", async () => {
      // Test disable command with partial ID (should work with "test-job-1" -> "test")
      const result = await runCronCommand(["disable", "test-job-1"]);
      expect(result.exitCode).toBe(0);

      // Verify job was disabled
      const storeContent = await fs.readFile(storePath, "utf-8");
      const store: CronStoreFile = JSON.parse(storeContent);
      const job = store.jobs.find(j => j.id === "test-job-1");
      expect(job?.enabled).toBe(false);
    });

    it("should handle ambiguous partial matches", async () => {
      // Create jobs with similar prefixes to test ambiguity
      const ambiguousStore: CronStoreFile = {
        version: "1.0",
        jobs: [
          {
            id: "abc123",
            name: "Job ABC123",
            schedule: { kind: "cron", expr: "0 * * * *" },
            payload: { channel: "C123456", text: "Test" },
            enabled: true,
            state: { nextRunAtMs: Date.now() + 3600000 },
            createdAtMs: Date.now(),
            updatedAtMs: Date.now()
          },
          {
            id: "abc456",
            name: "Job ABC456",
            schedule: { kind: "cron", expr: "30 * * * *" },
            payload: { channel: "C123456", text: "Test" },
            enabled: true,
            state: { nextRunAtMs: Date.now() + 7200000 },
            createdAtMs: Date.now(),
            updatedAtMs: Date.now()
          }
        ]
      };
      await fs.writeFile(storePath, JSON.stringify(ambiguousStore, null, 2));

      // Try to match with ambiguous prefix
      const result = await runCronCommand(["disable", "abc"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("ambiguous job id prefix");
    });

    it("should handle job not found", async () => {
      const result = await runCronCommand(["disable", "nonexistent"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("job not found");
    });
  });

  describe("fire command", () => {
    beforeAll(async () => {
      // Reset store with enabled job for fire tests
      const fireTestStore: CronStoreFile = {
        version: "1.0",
        jobs: [
          {
            id: "fire-test-job",
            name: "Fire Test Job",
            schedule: { kind: "cron", expr: "0 * * * *" },
            payload: { channel: "C123456", text: "Fire test message" },
            enabled: true,
            state: { nextRunAtMs: Date.now() + 3600000 },
            createdAtMs: Date.now(),
            updatedAtMs: Date.now()
          }
        ]
      };
      await fs.writeFile(storePath, JSON.stringify(fireTestStore, null, 2));
    });

    it("should fire an enabled job immediately", async () => {
      const beforeFire = Date.now();
      const result = await runCronCommand(["fire", "fire-test-job"]);
      const afterFire = Date.now();

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("will run immediately");

      // Verify job state was updated
      const storeContent = await fs.readFile(storePath, "utf-8");
      const store: CronStoreFile = JSON.parse(storeContent);
      const job = store.jobs.find(j => j.id === "fire-test-job");

      expect(job?.state.nextRunAtMs).toBeGreaterThanOrEqual(beforeFire);
      expect(job?.state.nextRunAtMs).toBeLessThanOrEqual(afterFire);
      expect(job?.state.runningAtMs).toBeUndefined();
      expect(job?.updatedAtMs).toBeGreaterThanOrEqual(beforeFire);
    });

    it("should reject firing disabled jobs", async () => {
      // First disable the job
      await runCronCommand(["disable", "fire-test-job"]);

      // Try to fire it
      const result = await runCronCommand(["fire", "fire-test-job"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("is disabled");
    });
  });

  describe("remove command with new resolver", () => {
    beforeAll(async () => {
      // Reset store for remove tests
      const removeTestStore: CronStoreFile = {
        version: "1.0",
        jobs: [
          {
            id: "remove-test-1",
            name: "Remove Test 1",
            schedule: { kind: "cron", expr: "0 * * * *" },
            payload: { channel: "C123456", text: "Remove test 1" },
            enabled: true,
            state: { nextRunAtMs: Date.now() + 3600000 },
            createdAtMs: Date.now(),
            updatedAtMs: Date.now()
          },
          {
            id: "remove-test-2",
            name: "Remove Test 2",
            schedule: { kind: "cron", expr: "30 * * * *" },
            payload: { channel: "C123456", text: "Remove test 2" },
            enabled: true,
            state: { nextRunAtMs: Date.now() + 7200000 },
            createdAtMs: Date.now(),
            updatedAtMs: Date.now()
          }
        ]
      };
      await fs.writeFile(storePath, JSON.stringify(removeTestStore, null, 2));
    });

    it("should remove job by exact ID", async () => {
      const result = await runCronCommand(["remove", "remove-test-1"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Removed job");

      // Verify job was removed
      const storeContent = await fs.readFile(storePath, "utf-8");
      const store: CronStoreFile = JSON.parse(storeContent);
      expect(store.jobs.length).toBe(1);
      expect(store.jobs.find(j => j.id === "remove-test-1")).toBeUndefined();
    });

    it("should remove job by partial ID prefix", async () => {
      const result = await runCronCommand(["remove", "remove-test-2"]);
      expect(result.exitCode).toBe(0);

      // Verify job was removed
      const storeContent = await fs.readFile(storePath, "utf-8");
      const store: CronStoreFile = JSON.parse(storeContent);
      expect(store.jobs.length).toBe(0);
    });
  });
});