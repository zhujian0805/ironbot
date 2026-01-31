import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { watchFile } from "../../src/utils/file_watcher.js";

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
});
