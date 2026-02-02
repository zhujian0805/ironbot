import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { logger } from "../utils/logging.ts";
import { resolveStateDir } from "../sessions/paths.ts";
import { DEFAULT_AGENT_ID, isMainSessionKey } from "../sessions/session_key.ts";
import { onTranscriptAppended } from "../sessions/transcript_events.ts";
import type { AppConfig } from "../config.ts";
import { resolveEmbeddingClient, type EmbeddingClient } from "./embeddings.ts";
import { ensureMemorySchema } from "./memory_schema.ts";
import { hybridSearch, type HybridSearchConfig, type MemoryHit, type MemoryChunk } from "./search.ts";

const DEFAULT_CHUNK_TOKENS = 400;
const DEFAULT_CHUNK_OVERLAP = 80;

const tokenize = (text: string): string[] => text.split(/\s+/).filter(Boolean);

const extractTranscriptText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

const chunkText = (text: string, maxTokens = DEFAULT_CHUNK_TOKENS, overlap = DEFAULT_CHUNK_OVERLAP): string[] => {
  const tokens = tokenize(text);
  if (!tokens.length) return [];
  const chunks: string[] = [];
  const step = Math.max(1, maxTokens - overlap);
  for (let i = 0; i < tokens.length; i += step) {
    const slice = tokens.slice(i, i + maxTokens);
    if (!slice.length) break;
    chunks.push(slice.join(" "));
  }
  return chunks;
};

const ensureDir = async (dir: string): Promise<void> => {
  await fs.promises.mkdir(dir, { recursive: true });
};

const readFileIfExists = async (filePath: string): Promise<string | null> => {
  try {
    return await fs.promises.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
};

const safeRealpath = async (filePath: string): Promise<string> => {
  try {
    return await fs.promises.realpath(filePath);
  } catch {
    return filePath;
  }
};

export class MemoryManager {
  private config: AppConfig;
  private db: Database;
  private embeddingClient: EmbeddingClient;
  private longTermPaths: Set<string> = new Set();

  constructor(config: AppConfig, agentId: string = DEFAULT_AGENT_ID) {
    this.config = config;
    const stateDir = resolveStateDir();
    const storePath = config.memorySearch.storePath || path.join(stateDir, "memory", `${agentId}.sqlite`);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    this.db = new Database(storePath);
    ensureMemorySchema(this.db);
    this.embeddingClient = resolveEmbeddingClient(config.embeddings);

    if (this.config.memory.sessionIndexing && this.config.memorySearch.sources.includes("sessions")) {
      onTranscriptAppended((event) => {
        const text = extractTranscriptText(event.message.content);
        if (!text) return;
        void this.recordTranscriptMessage({
          sessionKey: event.sessionKey,
          sessionFile: event.sessionFile,
          content: text
        });
      });
    }
  }

  private getWorkspaceDir(): string {
    return this.config.memory.workspaceDir;
  }

  private getDailyMemoryDir(): string {
    return path.join(this.getWorkspaceDir(), "memory");
  }

  private async getLongTermMemoryFiles(): Promise<string[]> {
    const root = this.getWorkspaceDir();
    const candidates = [path.join(root, "MEMORY.md"), path.join(root, "memory.md")];
    const existing: string[] = [];
    const seen = new Set<string>();
    for (const filePath of candidates) {
      try {
        await fs.promises.access(filePath);
        const key = await safeRealpath(filePath);
        if (!seen.has(key)) {
          seen.add(key);
          existing.push(filePath);
        }
      } catch {
        // optional
      }
    }
    this.longTermPaths = new Set(existing.map((item) => path.resolve(item)));
    return existing;
  }

  private async listDailyMemoryFiles(): Promise<string[]> {
    const dir = this.getDailyMemoryDir();
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => path.join(dir, entry.name));
    } catch {
      return [];
    }
  }

  private async listMemoryFiles(): Promise<string[]> {
    const daily = await this.listDailyMemoryFiles();
    const longTerm = await this.getLongTermMemoryFiles();
    return [...longTerm, ...daily];
  }

  private getHybridConfig(): HybridSearchConfig {
    return {
      vectorWeight: this.config.memorySearch.vectorWeight,
      textWeight: this.config.memorySearch.textWeight,
      candidateMultiplier: this.config.memorySearch.candidateMultiplier,
      maxResults: this.config.memorySearch.maxResults,
      minScore: this.config.memorySearch.minScore
    };
  }

  private runTransaction(action: () => void): void {
    this.db.exec("BEGIN");
    try {
      action();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private async indexFile(params: {
    filePath: string;
    source: "memory" | "sessions";
    sessionKey?: string;
    content: string;
  }): Promise<void> {
    const { filePath, source, sessionKey, content } = params;
    const chunks = chunkText(content);
    const shouldEmbed = this.embeddingClient.provider !== "none" && this.config.memorySearch.vectorWeight > 0;
    const embeddings = shouldEmbed ? await this.embeddingClient.embed(chunks) : [];

    const fileStats = await fs.promises.stat(filePath).catch(() => null);
    const updatedAt = fileStats ? Math.floor(fileStats.mtimeMs) : Date.now();

    const upsertFile = this.db.prepare(
      `INSERT INTO files (path, source, session_key, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         source = excluded.source,
         session_key = excluded.session_key,
         updated_at = excluded.updated_at`
    );
    const selectFileId = this.db.prepare("SELECT id FROM files WHERE path = ?");
    const deleteChunks = this.db.prepare("DELETE FROM chunks WHERE file_id = ?");
    const insertChunk = this.db.prepare(
      "INSERT INTO chunks (file_id, chunk_index, content, embedding, embedding_dim, metadata) VALUES (?, ?, ?, ?, ?, ?)"
    );

    this.runTransaction(() => {
      upsertFile.run(filePath, source, sessionKey ?? null, updatedAt);
      const fileRow = selectFileId.get(filePath) as { id: number } | null;
      if (!fileRow) return;
      deleteChunks.run(fileRow.id);
      for (let i = 0; i < chunks.length; i += 1) {
        const embedding = embeddings[i];
        insertChunk.run(
          fileRow.id,
          i,
          chunks[i],
          embedding ? JSON.stringify(embedding) : null,
          embedding ? embedding.length : null,
          null
        );
      }
    });
  }

  private async syncMemoryFiles(): Promise<void> {
    const files = await this.listMemoryFiles();
    const resolvedSet = new Set(files.map((filePath) => path.resolve(filePath)));

    const dbFiles = this.db
      .prepare("SELECT path FROM files WHERE source = 'memory'")
      .all() as Array<{ path: string }>;
    for (const entry of dbFiles) {
      const resolved = path.resolve(entry.path);
      if (!resolvedSet.has(resolved)) {
        this.db.prepare("DELETE FROM files WHERE path = ?").run(entry.path);
      }
    }

    for (const filePath of files) {
      const stat = await fs.promises.stat(filePath).catch(() => null);
      if (!stat) continue;
      const updatedAt = Math.floor(stat.mtimeMs);
      const existing = this.db
        .prepare("SELECT updated_at FROM files WHERE path = ?")
        .get(filePath) as { updated_at?: number } | null;
      if (existing && existing.updated_at === updatedAt) continue;
      const content = await readFileIfExists(filePath);
      if (content === null) continue;
      await this.indexFile({ filePath, source: "memory", content });
    }
  }

  private async loadChunks(sources: Array<"memory" | "sessions">): Promise<MemoryChunk[]> {
    if (!sources.length) return [];
    const placeholders = sources.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT chunks.id, chunks.content, chunks.embedding, files.path, files.source, files.session_key
         FROM chunks
         JOIN files ON files.id = chunks.file_id
         WHERE files.source IN (${placeholders})`
      )
      .all(...sources) as Array<{
      id: number;
      content: string;
      embedding: string | null;
      path: string;
      source: "memory" | "sessions";
      session_key: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      embedding: row.embedding ? (JSON.parse(row.embedding) as number[]) : undefined,
      source: row.source,
      path: row.path,
      sessionKey: row.session_key
    }));
  }

  private filterLongTermMemory(chunks: MemoryChunk[], sessionKey?: string, crossSessionMemory?: boolean): MemoryChunk[] {
    let filtered = chunks;
    // Filter long-term memory for non-main sessions
    if (!isMainSessionKey(sessionKey) && this.longTermPaths.size) {
      filtered = filtered.filter((chunk) => !this.longTermPaths.has(path.resolve(chunk.path)));
    }
    // Filter session chunks based on cross-session memory setting
    const useCrossSession = crossSessionMemory ?? this.config.memorySearch.crossSessionMemory;
    if (sessionKey && !useCrossSession) {
      filtered = filtered.filter((chunk) => chunk.source !== "sessions" || chunk.sessionKey === sessionKey);
    }
    return filtered;
  }

  async search(query: string, params: { sessionKey?: string; crossSessionMemory?: boolean } = {}): Promise<MemoryHit[]> {
    if (!this.config.memorySearch.enabled) return [];

    await ensureDir(this.getDailyMemoryDir());
    await ensureDir(this.getWorkspaceDir());
    await this.syncMemoryFiles();

    const sources = this.config.memorySearch.sources.filter((source) => {
      if (source === "sessions") {
        return this.config.memory.sessionIndexing;
      }
      return true;
    });

    if (!sources.length) return [];

    const chunks = await this.loadChunks(sources);
    const filtered = this.filterLongTermMemory(chunks, params.sessionKey, params.crossSessionMemory);

    const shouldEmbed = this.embeddingClient.provider !== "none" && this.config.memorySearch.vectorWeight > 0;
    const queryEmbedding = shouldEmbed ? (await this.embeddingClient.embed([query]))[0] : undefined;

    return hybridSearch({
      query,
      queryEmbedding,
      chunks: filtered,
      config: this.getHybridConfig()
    });
  }

  async recordTranscriptMessage(params: {
    sessionKey: string;
    sessionFile: string;
    content: string;
  }): Promise<void> {
    if (!this.config.memory.sessionIndexing) return;
    if (!this.config.memorySearch.sources.includes("sessions")) return;

    const content = params.content.trim();
    if (!content) return;

    const filePath = params.sessionFile;
    const shouldEmbed = this.embeddingClient.provider !== "none" && this.config.memorySearch.vectorWeight > 0;
    const embedding = shouldEmbed ? (await this.embeddingClient.embed([content]))[0] : undefined;

    const upsertFile = this.db.prepare(
      `INSERT INTO files (path, source, session_key, updated_at)
       VALUES (?, 'sessions', ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         source = excluded.source,
         session_key = excluded.session_key,
         updated_at = excluded.updated_at`
    );
    const selectFileId = this.db.prepare("SELECT id FROM files WHERE path = ?");
    const insertChunk = this.db.prepare(
      "INSERT INTO chunks (file_id, chunk_index, content, embedding, embedding_dim, metadata) VALUES (?, ?, ?, ?, ?, ?)"
    );

    this.runTransaction(() => {
      const updatedAt = Date.now();
      upsertFile.run(filePath, params.sessionKey, updatedAt);
      const fileRow = selectFileId.get(filePath) as { id: number } | null;
      if (!fileRow) return;
      const existingCount = this.db
        .prepare("SELECT COUNT(*) as count FROM chunks WHERE file_id = ?")
        .get(fileRow.id) as { count: number } | null;
      const nextIndex = existingCount?.count ?? 0;
      insertChunk.run(
        fileRow.id,
        nextIndex,
        content,
        embedding ? JSON.stringify(embedding) : null,
        embedding ? embedding.length : null,
        null
      );
    });
  }

  logStatus(): void {
    logger.info(
      {
        provider: this.embeddingClient.provider,
        model: this.embeddingClient.model,
        memorySearchEnabled: this.config.memorySearch.enabled,
        sessionIndexing: this.config.memory.sessionIndexing
      },
      "Memory manager initialized"
    );
  }
}
