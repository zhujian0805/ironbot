import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { watchFile, type WatchHandle } from "../../src/utils/file_watcher.ts";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";

describe("File Watcher", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "file-watcher-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("watchFile", () => {
    it("calls onChange when file is modified", async () => {
      const testFile = path.join(tempDir, "test.txt");
      await fs.writeFile(testFile, "initial content");

      const onChange = vi.fn();
      const onError = vi.fn();

      const handle = watchFile(testFile, onChange, onError, { debounceMs: 10, awaitWriteFinish: false });

      // Wait longer for watcher to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Modify file
      await fs.writeFile(testFile, "modified content");

      // Wait for write to finish and debounce
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(onChange).toHaveBeenCalledTimes(1);

      await handle.close();
    });

    it("calls onChange when file is added", async () => {
      const testFile = path.join(tempDir, "newfile.txt");

      const onChange = vi.fn();
      const onError = vi.fn();

      const handle = watchFile(testFile, onChange, onError, { debounceMs: 10, awaitWriteFinish: false });

      // Wait a bit for watcher to be ready
      await new Promise(resolve => setTimeout(resolve, 50));

      // Create file
      await fs.writeFile(testFile, "new content");

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(onChange).toHaveBeenCalledTimes(1);

      await handle.close();
    });

    it("debounces multiple changes", async () => {
      const testFile = path.join(tempDir, "test.txt");
      await fs.writeFile(testFile, "initial");

      const onChange = vi.fn();

      const handle = watchFile(testFile, onChange, undefined, { debounceMs: 50, awaitWriteFinish: false });

      // Wait for watcher
      await new Promise(resolve => setTimeout(resolve, 50));

      // Multiple rapid changes
      await fs.writeFile(testFile, "change1");
      await fs.writeFile(testFile, "change2");
      await fs.writeFile(testFile, "change3");

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should only call once due to debouncing
      expect(onChange).toHaveBeenCalledTimes(1);

      await handle.close();
    });

    it("calls onError when onChange throws", async () => {
      const testFile = path.join(tempDir, "test.txt");
      await fs.writeFile(testFile, "initial");

      const onChange = vi.fn().mockRejectedValue(new Error("Test error"));
      const onError = vi.fn();

      const handle = watchFile(testFile, onChange, onError, { debounceMs: 10, awaitWriteFinish: false });

      // Wait for watcher
      await new Promise(resolve => setTimeout(resolve, 50));

      // Modify file
      await fs.writeFile(testFile, "modified");

      // Wait for debounce and error handling
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(new Error("Test error"));

      await handle.close();
    });

    it("uses default options when not provided", async () => {
      const testFile = path.join(tempDir, "test.txt");
      await fs.writeFile(testFile, "initial");

      const onChange = vi.fn();

      const handle = watchFile(testFile, onChange);

      // Wait for watcher
      await new Promise(resolve => setTimeout(resolve, 50));

      // Modify file
      await fs.writeFile(testFile, "modified");

      // Wait for default debounce (150ms) + awaitWriteFinish stability (200ms)
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(onChange).toHaveBeenCalledTimes(1);

      await handle.close();
    });

    it("can close the watcher", async () => {
      const testFile = path.join(tempDir, "test.txt");
      await fs.writeFile(testFile, "initial");

      const onChange = vi.fn();

      const handle = watchFile(testFile, onChange, undefined, { debounceMs: 10 });

      // Wait for watcher
      await new Promise(resolve => setTimeout(resolve, 50));

      await handle.close();

      // Modify file after close
      await fs.writeFile(testFile, "modified");

      // Wait
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not have called onChange after close
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});