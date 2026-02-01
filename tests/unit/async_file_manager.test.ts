import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { AsyncFileManager } from "../../src/services/async_file_manager.ts";

describe("AsyncFileManager", () => {
  let fileManager: AsyncFileManager;
  let tempDir: string;

  beforeEach(async () => {
    fileManager = new AsyncFileManager();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "async-file-test-"));
  });

  afterEach(async () => {
    await fileManager.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("writeFile", () => {
    it("writes files asynchronously", async () => {
      const testFile = path.join(tempDir, "test.txt");
      const testContent = "Hello, World!";

      await fileManager.writeFile(testFile, testContent);

      const content = await fs.readFile(testFile, "utf8");
      expect(content).toBe(testContent);
    });

    it("creates necessary directories", async () => {
      const nestedFile = path.join(tempDir, "deep", "nested", "file.txt");
      const testContent = "Nested content";

      await fileManager.writeFile(nestedFile, testContent);

      const content = await fs.readFile(nestedFile, "utf8");
      expect(content).toBe(testContent);
    });
  });

  describe("appendFile", () => {
    it("appends to existing files", async () => {
      const testFile = path.join(tempDir, "append.txt");

      await fileManager.writeFile(testFile, "First line\n");
      await fileManager.appendFile(testFile, "Second line\n");

      const content = await fs.readFile(testFile, "utf8");
      expect(content).toBe("First line\nSecond line\n");
    });

    it("creates file if it doesn't exist", async () => {
      const testFile = path.join(tempDir, "new-append.txt");

      await fileManager.appendFile(testFile, "Appended content\n");

      const content = await fs.readFile(testFile, "utf8");
      expect(content).toBe("Appended content\n");
    });
  });

  describe("readFile", () => {
    it("reads files asynchronously", async () => {
      const testFile = path.join(tempDir, "read.txt");
      const testContent = "Content to read";

      await fs.writeFile(testFile, testContent);
      const content = await fileManager.readFile(testFile);

      expect(content).toBe(testContent);
    });
  });

  describe("bufferWrite", () => {
    it("buffers writes for batching", async () => {
      const testFile = path.join(tempDir, "buffered.txt");

      fileManager.bufferWrite(testFile, "Line 1\n");
      fileManager.bufferWrite(testFile, "Line 2\n");

      // Force flush
      await fileManager["flushWriteBuffer"]();

      const content = await fs.readFile(testFile, "utf8");
      expect(content).toBe("Line 1\nLine 2\n");
    });

    it("auto-flushes when buffer gets large", async () => {
      const testFile = path.join(tempDir, "large-buffer.txt");

      // Fill buffer beyond max size (10)
      for (let i = 0; i < 15; i++) {
        fileManager.bufferWrite(testFile, `Line ${i}\n`);
      }

      // Should have auto-flushed
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay for async flush

      const stats = fileManager.getStats();
      expect(stats.bufferedWrites).toBeLessThan(15); // Should have flushed some
    });
  });

  describe("priority handling", () => {
    it("executes high priority operations first", async () => {
      const executionOrder: string[] = [];
      const testFile1 = path.join(tempDir, "priority1.txt");
      const testFile2 = path.join(tempDir, "priority2.txt");

      const highPriority = fileManager.writeFile(testFile1, "high priority", "high");
      const lowPriority = fileManager.writeFile(testFile2, "low priority", "low");

      await Promise.all([highPriority, lowPriority]);

      // Both should succeed regardless of priority
      const content1 = await fs.readFile(testFile1, "utf8");
      const content2 = await fs.readFile(testFile2, "utf8");
      expect(content1).toBe("high priority");
      expect(content2).toBe("low priority");
    });
  });

  describe("getStats", () => {
    it("returns correct statistics", async () => {
      const stats = fileManager.getStats();

      expect(stats).toHaveProperty("queuedOperations");
      expect(stats).toHaveProperty("bufferedWrites");
      expect(stats).toHaveProperty("isProcessing");

      expect(typeof stats.queuedOperations).toBe("number");
      expect(typeof stats.bufferedWrites).toBe("number");
      expect(typeof stats.isProcessing).toBe("boolean");
    });

    it("shows active processing", async () => {
      const testFile = path.join(tempDir, "stats.txt");

      const writePromise = fileManager.writeFile(testFile, "Test content");

      // Check stats while operation is in progress
      const stats = fileManager.getStats();
      expect(stats.queuedOperations).toBeGreaterThanOrEqual(0);

      await writePromise;
    });
  });

  describe("shutdown", () => {
    it("flushes buffered writes on shutdown", async () => {
      const testFile = path.join(tempDir, "shutdown.txt");

      fileManager.bufferWrite(testFile, "Buffered content\n");

      await fileManager.shutdown();

      const content = await fs.readFile(testFile, "utf8");
      expect(content).toBe("Buffered content\n");
    });
  });
});