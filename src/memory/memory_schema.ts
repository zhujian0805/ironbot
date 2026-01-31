import { Database } from "bun:sqlite";

export type MemoryDatabase = Database;

export const ensureMemorySchema = (db: MemoryDatabase): void => {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      session_key TEXT,
      updated_at INTEGER
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY,
      file_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT,
      embedding_dim INTEGER,
      metadata TEXT,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON chunks(file_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_files_source ON files(source);");
};
