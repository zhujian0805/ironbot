import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CronStoreFile, CronJob } from "../../src/cron/types.ts";

// Recreate the resolveJobByIdInput function for unit testing
const resolveJobByIdInput = (store: CronStoreFile, idInput: string): CronJob => {
  const id = idInput.trim();
  const exact = store.jobs.find((entry) => entry.id === id);
  if (exact) {
    return exact;
  }
  const prefixMatches = store.jobs.filter((entry) => entry.id.startsWith(id));
  if (prefixMatches.length === 1) {
    return prefixMatches[0]!;
  }
  if (prefixMatches.length > 1) {
    const candidates = prefixMatches.map((entry) => entry.id.slice(0, 8)).join(", ");
    throw new Error(`ambiguous job id prefix '${id}'; matches: ${candidates}`);
  }
  throw new Error(`job not found: ${idInput}`);
};

// Mock error function for testing
const mockError = (message: string): never => {
  throw new Error(message);
};

describe("resolveJobByIdInput function", () => {
  const mockStore: CronStoreFile = {
    version: "1.0",
    jobs: [
      {
        id: "abc123def",
        name: "Test Job 1",
        schedule: { kind: "cron", expr: "0 * * * *" },
        payload: { channel: "C123456", text: "Test message 1" },
        enabled: true,
        state: { nextRunAtMs: Date.now() + 3600000 },
        createdAtMs: Date.now(),
        updatedAtMs: Date.now()
      },
      {
        id: "abc456ghi",
        name: "Test Job 2",
        schedule: { kind: "cron", expr: "30 * * * *" },
        payload: { channel: "C123456", text: "Test message 2" },
        enabled: false,
        state: { nextRunAtMs: Date.now() + 7200000 },
        createdAtMs: Date.now(),
        updatedAtMs: Date.now()
      },
      {
        id: "xyz789jkl",
        name: "Test Job 3",
        schedule: { kind: "cron", expr: "45 * * * *" },
        payload: { channel: "C123456", text: "Test message 3" },
        enabled: true,
        state: { nextRunAtMs: Date.now() + 10800000 },
        createdAtMs: Date.now(),
        updatedAtMs: Date.now()
      }
    ]
  };

  it("should find job by exact ID match", () => {
    const result = resolveJobByIdInput(mockStore, "abc123def");
    expect(result.id).toBe("abc123def");
    expect(result.name).toBe("Test Job 1");
  });

  it("should find job by unique partial ID prefix", () => {
    const result = resolveJobByIdInput(mockStore, "abc123");
    expect(result.id).toBe("abc123def");
    expect(result.name).toBe("Test Job 1");
  });

  it("should handle whitespace in input", () => {
    const result = resolveJobByIdInput(mockStore, "  abc123def  ");
    expect(result.id).toBe("abc123def");
  });

  it("should throw error for ambiguous partial matches", () => {
    expect(() => resolveJobByIdInput(mockStore, "abc")).toThrow(
      "ambiguous job id prefix 'abc'; matches: abc123de, abc456gh"
    );
  });

  it("should throw error when no jobs match", () => {
    expect(() => resolveJobByIdInput(mockStore, "nonexistent")).toThrow(
      "job not found: nonexistent"
    );
  });

  it("should throw error for empty input after trimming", () => {
    expect(() => resolveJobByIdInput(mockStore, "   ")).toThrow(
      "ambiguous job id prefix ''"
    );
  });

  it("should prefer exact match over prefix matches", () => {
    // Add a job where the ID is a prefix of another
    const testStore: CronStoreFile = {
      version: "1.0",
      jobs: [
        {
          id: "test",
          name: "Exact Match Job",
          schedule: { kind: "cron", expr: "0 * * * *" },
          payload: { channel: "C123456", text: "Exact" },
          enabled: true,
          state: { nextRunAtMs: Date.now() + 3600000 },
          createdAtMs: Date.now(),
          updatedAtMs: Date.now()
        },
        {
          id: "test-prefix",
          name: "Prefix Match Job",
          schedule: { kind: "cron", expr: "30 * * * *" },
          payload: { channel: "C123456", text: "Prefix" },
          enabled: true,
          state: { nextRunAtMs: Date.now() + 7200000 },
          createdAtMs: Date.now(),
          updatedAtMs: Date.now()
        }
      ]
    };

    const result = resolveJobByIdInput(testStore, "test");
    expect(result.id).toBe("test");
    expect(result.name).toBe("Exact Match Job");
  });

  it("should find unique prefix when exact match doesn't exist", () => {
    const result = resolveJobByIdInput(mockStore, "xyz789");
    expect(result.id).toBe("xyz789jkl");
    expect(result.name).toBe("Test Job 3");
  });
});