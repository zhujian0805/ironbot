import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { MemoryManager } from "../../../src/memory/manager.ts";

// Mock dependencies
vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    promises: {
      mkdir: vi.fn(),
      readdir: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      stat: vi.fn(),
      access: vi.fn(),
      realpath: vi.fn()
    }
  }
}));

vi.mock("../../../src/utils/logging.ts", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock("../../../src/sessions/paths.ts", () => ({
  resolveStateDir: vi.fn(() => "/tmp/state")
}));

vi.mock("../../../src/sessions/session_key.ts", () => ({
  DEFAULT_AGENT_ID: "test-agent",
  isMainSessionKey: vi.fn(() => false)
}));

vi.mock("../../../src/sessions/transcript_events.ts", () => ({
  onTranscriptAppended: vi.fn()
}));

vi.mock("../../../src/memory/embeddings.ts", () => ({
  resolveEmbeddingClient: vi.fn(() => ({
    provider: "none",
    model: "",
    embed: vi.fn(() => [])
  }))
}));

vi.mock("../../../src/memory/memory_schema.ts", () => ({
  ensureMemorySchema: vi.fn()
}));

describe("MemoryManager", () => {
  let tempDir: string;
  let db: Database;

  beforeEach(() => {
    tempDir = `/tmp/memory-test-${Date.now()}`;
    vi.clearAllMocks();

    // Mock fs operations
    vi.mocked(fs).mkdirSync.mockImplementation(() => undefined);
    vi.mocked(fs.promises).mkdir.mockResolvedValue(undefined);
    vi.mocked(fs.promises).readdir.mockResolvedValue([]);
    vi.mocked(fs.promises).readFile.mockResolvedValue("");
    vi.mocked(fs.promises).stat.mockResolvedValue({
      mtimeMs: Date.now(),
      isDirectory: () => false,
      isFile: () => true
    } as any);
    vi.mocked(fs.promises).access.mockResolvedValue(undefined);
    vi.mocked(fs.promises).realpath.mockImplementation((p) => Promise.resolve(p));

    // Create in-memory database for testing
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("constructor", () => {
    it("initializes with correct configuration", () => {
      const config = {
        memory: {
          workspaceDir: "/workspace",
          sessionIndexing: true
        },
        memorySearch: {
          enabled: true,
          sources: ["memory", "sessions"],
          storePath: undefined,
          vectorWeight: 0.7,
          textWeight: 0.3,
          candidateMultiplier: 2,
          maxResults: 10,
          minScore: 0.1,
          crossSessionMemory: false
        },
        embeddings: {
          provider: "none",
          fallback: "none"
        }
      } as any;

      const manager = new MemoryManager(config);

      expect(manager).toBeDefined();
      expect(vi.mocked(require("../../../src/sessions/paths.ts")).resolveStateDir).toHaveBeenCalled();
      expect(vi.mocked(require("../../../src/memory/embeddings.ts")).resolveEmbeddingClient).toHaveBeenCalledWith(config.embeddings);
      expect(vi.mocked(require("../../../src/memory/memory_schema.ts")).ensureMemorySchema).toHaveBeenCalled();
    });

    it("creates database file in correct location", () => {
      const config = {
        memory: { workspaceDir: "/workspace", sessionIndexing: false },
        memorySearch: { enabled: true, sources: ["memory"], storePath: undefined, vectorWeight: 0.5, textWeight: 0.5, candidateMultiplier: 2, maxResults: 10, minScore: 0, crossSessionMemory: false },
        embeddings: { provider: "none", fallback: "none" }
      } as any;

      new MemoryManager(config);

      expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname("/tmp/state/memory/test-agent.sqlite"), { recursive: true });
    });
  });

  describe("search", () => {
    let manager: MemoryManager;

    beforeEach(() => {
      const config = {
        memory: { workspaceDir: "/workspace", sessionIndexing: false },
        memorySearch: {
          enabled: true,
          sources: ["memory"],
          storePath: undefined,
          vectorWeight: 0,
          textWeight: 1,
          candidateMultiplier: 2,
          maxResults: 10,
          minScore: 0,
          crossSessionMemory: false
        },
        embeddings: { provider: "none", fallback: "none" }
      } as any;

      manager = new MemoryManager(config);
      // Replace the database with our test one
      (manager as any).db = db;
    });

    it("returns empty array when search is disabled", async () => {
      const config = {
        memory: { workspaceDir: "/workspace", sessionIndexing: false },
        memorySearch: { enabled: false, sources: [], storePath: undefined, vectorWeight: 0, textWeight: 0, candidateMultiplier: 1, maxResults: 1, minScore: 0, crossSessionMemory: false },
        embeddings: { provider: "none", fallback: "none" }
      } as any;

      const disabledManager = new MemoryManager(config);
      (disabledManager as any).db = db;

      const results = await disabledManager.search("test");

      expect(results).toEqual([]);
    });

    it("searches memory files", async () => {
      // Insert test data
      db.exec(`
        INSERT INTO files (path, source, updated_at) VALUES ('/test/file.md', 'memory', ${Date.now()});
        INSERT INTO chunks (file_id, chunk_index, content, embedding, embedding_dim)
        VALUES (1, 0, 'This is a test document about testing', NULL, NULL);
      `);

      const results = await manager.search("test");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain("test");
    });

    it("filters results by session key", async () => {
      // Insert test data with session key
      db.exec(`
        INSERT INTO files (path, source, session_key, updated_at) VALUES ('/test/session.md', 'sessions', 'session-1', ${Date.now()});
        INSERT INTO chunks (file_id, chunk_index, content, embedding, embedding_dim)
        VALUES (1, 0, 'Session specific content', NULL, NULL);
      `);

      const results = await manager.search("content", { sessionKey: "session-1" });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].sessionKey).toBe("session-1");
    });
  });

  describe("recordTranscriptMessage", () => {
    let manager: MemoryManager;

    beforeEach(() => {
      const config = {
        memory: { workspaceDir: "/workspace", sessionIndexing: true },
        memorySearch: {
          enabled: true,
          sources: ["sessions"],
          storePath: undefined,
          vectorWeight: 0,
          textWeight: 1,
          candidateMultiplier: 2,
          maxResults: 10,
          minScore: 0,
          crossSessionMemory: false
        },
        embeddings: { provider: "none", fallback: "none" }
      } as any;

      manager = new MemoryManager(config);
      (manager as any).db = db;
    });

    it("records transcript message", async () => {
      await manager.recordTranscriptMessage({
        sessionKey: "test-session",
        sessionFile: "/transcripts/test.jsonl",
        content: "User asked about testing"
      });

      const files = db.prepare("SELECT * FROM files").all();
      const chunks = db.prepare("SELECT * FROM chunks").all();

      expect(files.length).toBe(1);
      expect(files[0].session_key).toBe("test-session");
      expect(chunks.length).toBe(1);
      expect(chunks[0].content).toBe("User asked about testing");
    });

    it("skips recording when session indexing disabled", async () => {
      const config = {
        memory: { workspaceDir: "/workspace", sessionIndexing: false },
        memorySearch: { enabled: true, sources: ["sessions"], storePath: undefined, vectorWeight: 0, textWeight: 1, candidateMultiplier: 2, maxResults: 10, minScore: 0, crossSessionMemory: false },
        embeddings: { provider: "none", fallback: "none" }
      } as any;

      const disabledManager = new MemoryManager(config);
      (disabledManager as any).db = db;

      await disabledManager.recordTranscriptMessage({
        sessionKey: "test-session",
        sessionFile: "/transcripts/test.jsonl",
        content: "Should not be recorded"
      });

      const files = db.prepare("SELECT * FROM files").all();
      expect(files.length).toBe(0);
    });

    it("skips empty content", async () => {
      await manager.recordTranscriptMessage({
        sessionKey: "test-session",
        sessionFile: "/transcripts/test.jsonl",
        content: ""
      });

      const files = db.prepare("SELECT * FROM files").all();
      expect(files.length).toBe(0);
    });
  });

  describe("logStatus", () => {
    it("logs memory manager status", () => {
      const config = {
        memory: { workspaceDir: "/workspace", sessionIndexing: true },
        memorySearch: { enabled: true, sources: ["memory"], storePath: undefined, vectorWeight: 0.5, textWeight: 0.5, candidateMultiplier: 2, maxResults: 10, minScore: 0, crossSessionMemory: false },
        embeddings: { provider: "none", fallback: "none" }
      } as any;

      const manager = new MemoryManager(config);
      manager.logStatus();

      expect(vi.mocked(require("../../../src/utils/logging.ts")).logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "none",
          model: "",
          memorySearchEnabled: true,
          sessionIndexing: true
        }),
        "Memory manager initialized"
      );
    });
  });
});
