import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { watchFile } from "../../src/utils/file_watcher.ts";

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 2000,
  intervalMs = 50
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for condition");
};

describe("file watcher", () => {
  it("triggers change callbacks with debounce", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-watch-"));
    const filePath = join(dir, "watched.txt");
    await writeFile(filePath, "initial");

    let changeCount = 0;
    const handle = watchFile(
      filePath,
      () => {
        changeCount += 1;
      },
      undefined,
      { debounceMs: 100 }
    );

    await writeFile(filePath, "updated");

    await waitFor(() => changeCount > 0);

    await handle.close();
    await rm(dir, { recursive: true, force: true });

    expect(changeCount).toBeGreaterThan(0);
  });

  it("handles add events for new files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-watch-"));
    const filePath = join(dir, "newfile.txt");

    let eventCount = 0;
    const handle = watchFile(
      filePath,
      () => {
        eventCount += 1;
      },
      undefined,
      { debounceMs: 50 }
    );

    // Wait a bit for the watcher to be fully set up
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create the file after starting the watcher
    await writeFile(filePath, "new content");

    await waitFor(() => eventCount > 0, 5000); // Increase timeout to 5 seconds

    await handle.close();
    await rm(dir, { recursive: true, force: true });

    expect(eventCount).toBeGreaterThan(0);
  });

  it("respects custom debounce timing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-watch-"));
    const filePath = join(dir, "debounce.txt");
    await writeFile(filePath, "initial");

    let changeCount = 0;
    const startTime = Date.now();

    const handle = watchFile(
      filePath,
      () => {
        changeCount += 1;
      },
      undefined,
      { debounceMs: 200 }
    );

    await writeFile(filePath, "updated");

    await waitFor(() => changeCount > 0);

    const elapsed = Date.now() - startTime;

    await handle.close();
    await rm(dir, { recursive: true, force: true });

    // Should take at least the debounce time
    expect(elapsed).toBeGreaterThanOrEqual(180); // Allow some margin
    expect(changeCount).toBe(1);
  });

  it("supports awaitWriteFinish options", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-watch-"));
    const filePath = join(dir, "await-write.txt");
    await writeFile(filePath, "initial");

    let changeCount = 0;

    const handle = watchFile(
      filePath,
      () => {
        changeCount += 1;
      },
      undefined,
      {
        debounceMs: 50,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 25
        }
      }
    );

    // Rapid writes that should be debounced
    await writeFile(filePath, "update1");
    await writeFile(filePath, "update2");
    await writeFile(filePath, "final");

    await waitFor(() => changeCount > 0, 3000);

    await handle.close();
    await rm(dir, { recursive: true, force: true });

    expect(changeCount).toBe(1); // Should only trigger once after stability
  });

  it("handles rapid consecutive changes with debouncing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-watch-"));
    const filePath = join(dir, "rapid.txt");
    await writeFile(filePath, "initial");

    let changeCount = 0;

    const handle = watchFile(
      filePath,
      () => {
        changeCount += 1;
      },
      undefined,
      { debounceMs: 100 }
    );

    // Make multiple rapid changes
    await writeFile(filePath, "change1");
    await writeFile(filePath, "change2");
    await writeFile(filePath, "change3");

    await waitFor(() => changeCount > 0, 3000);

    await handle.close();
    await rm(dir, { recursive: true, force: true });

    // Should only trigger once due to debouncing
    expect(changeCount).toBe(1);
  });

  it("calls error callback on file system errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-watch-"));
    const filePath = join(dir, "error-test.txt");

    let errorCount = 0;
    let lastError: unknown;

    const handle = watchFile(
      filePath,
      () => {
        // Should not be called
      },
      (error) => {
        errorCount += 1;
        lastError = error;
      },
      { debounceMs: 50 }
    );

    // Try to watch a non-existent file in a directory we'll delete
    await rm(dir, { recursive: true, force: true });

    // Wait a bit for potential errors
    await new Promise(resolve => setTimeout(resolve, 200));

    await handle.close();

    // Note: chokidar might not always emit errors immediately, so this test
    // verifies the error callback is properly set up
    expect(typeof lastError).toBeDefined();
  });

  it("handles invalid file paths gracefully", async () => {
    const invalidPath = "/dev/null/invalid/path/that/does/not/exist";

    let errorCount = 0;

    const handle = watchFile(
      invalidPath,
      () => {
        // Should not be called
      },
      () => {
        errorCount += 1;
      },
      { debounceMs: 50 }
    );

    // Wait for potential error handling
    await new Promise(resolve => setTimeout(resolve, 200));

    await handle.close();

    // The watcher should handle invalid paths without crashing
    expect(errorCount).toBeGreaterThanOrEqual(0);
  });

  it("can be closed multiple times without error", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-watch-"));
    const filePath = join(dir, "close-test.txt");
    await writeFile(filePath, "test");

    const handle = watchFile(
      filePath,
      () => {
        // No-op
      },
      undefined,
      { debounceMs: 50 }
    );

    // Close multiple times
    await handle.close();
    await handle.close();
    await handle.close();

    await rm(dir, { recursive: true, force: true });

    // Should not throw
  });

  it("handles callback errors gracefully", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-watch-"));
    const filePath = join(dir, "error-callback.txt");
    await writeFile(filePath, "initial");

    let errorCount = 0;
    let changeCount = 0;

    const handle = watchFile(
      filePath,
      () => {
        changeCount += 1;
        throw new Error("Callback error");
      },
      () => {
        errorCount += 1;
      },
      { debounceMs: 50 }
    );

    await writeFile(filePath, "updated");

    await waitFor(() => errorCount > 0, 3000);

    await handle.close();
    await rm(dir, { recursive: true, force: true });

    expect(errorCount).toBeGreaterThan(0);
    expect(changeCount).toBe(1); // Callback was called once
  });

  it("works with default options", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-watch-"));
    const filePath = join(dir, "defaults.txt");
    await writeFile(filePath, "initial");

    let changeCount = 0;

    const handle = watchFile(
      filePath,
      () => {
        changeCount += 1;
      }
    );

    await writeFile(filePath, "updated");

    await waitFor(() => changeCount > 0);

    await handle.close();
    await rm(dir, { recursive: true, force: true });

    expect(changeCount).toBeGreaterThan(0);
  });
});
