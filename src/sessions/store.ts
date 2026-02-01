import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SessionEntry, SessionStoreRecord } from "./types.ts";

const DEFAULT_SESSION_STORE_TTL_MS = 45_000;

type SessionStoreCacheEntry = {
  store: SessionStoreRecord;
  loadedAt: number;
  storePath: string;
  mtimeMs?: number;
};

const SESSION_STORE_CACHE = new Map<string, SessionStoreCacheEntry>();

const parseOptionalInt = (value: string | undefined | null): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getSessionStoreTtl = (): number =>
  parseOptionalInt(process.env.IRONBOT_SESSION_CACHE_TTL_MS ?? process.env.OPENCLAW_SESSION_CACHE_TTL_MS) ??
  DEFAULT_SESSION_STORE_TTL_MS;

const isCacheEnabled = (ttlMs: number): boolean => ttlMs > 0;

const getFileMtimeMs = (filePath: string): number | undefined => {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return undefined;
  }
};

const isSessionStoreCacheValid = (entry: SessionStoreCacheEntry): boolean =>
  Date.now() - entry.loadedAt <= getSessionStoreTtl();

const invalidateSessionStoreCache = (storePath: string): void => {
  SESSION_STORE_CACHE.delete(storePath);
};

export const clearSessionStoreCacheForTest = (): void => {
  SESSION_STORE_CACHE.clear();
};

type LoadSessionStoreOptions = {
  skipCache?: boolean;
};

export const loadSessionStore = (
  storePath: string,
  opts: LoadSessionStoreOptions = {}
): SessionStoreRecord => {
  const ttl = getSessionStoreTtl();
  if (!opts.skipCache && isCacheEnabled(ttl)) {
    const cached = SESSION_STORE_CACHE.get(storePath);
    if (cached && isSessionStoreCacheValid(cached)) {
      const currentMtime = getFileMtimeMs(storePath);
      if (currentMtime === cached.mtimeMs) {
        return structuredClone(cached.store);
      }
      invalidateSessionStoreCache(storePath);
    }
  }

  let store: SessionStoreRecord = {};
  let mtimeMs = getFileMtimeMs(storePath);
  try {
    const raw = fs.readFileSync(storePath, "utf-8");
    const parsed = JSON.parse(raw) as SessionStoreRecord;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      store = parsed;
    }
    mtimeMs = getFileMtimeMs(storePath) ?? mtimeMs;
  } catch {
    // ignore missing or invalid store
  }

  if (!opts.skipCache && isCacheEnabled(ttl)) {
    SESSION_STORE_CACHE.set(storePath, {
      store: structuredClone(store),
      loadedAt: Date.now(),
      storePath,
      mtimeMs
    });
  }

  return structuredClone(store);
};

const saveSessionStoreUnlocked = async (storePath: string, store: SessionStoreRecord): Promise<void> => {
  invalidateSessionStoreCache(storePath);
  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
  const json = JSON.stringify(store, null, 2);

  if (process.platform === "win32") {
    try {
      await fs.promises.writeFile(storePath, json, "utf-8");
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : null;
      if (code === "ENOENT") return;
      throw error;
    }
    return;
  }

  const tmp = `${storePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(tmp, json, { mode: 0o600, encoding: "utf-8" });
    await fs.promises.rename(tmp, storePath);
    await fs.promises.chmod(storePath, 0o600);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : null;
    if (code === "ENOENT") {
      try {
        await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
        await fs.promises.writeFile(storePath, json, { mode: 0o600, encoding: "utf-8" });
        await fs.promises.chmod(storePath, 0o600);
      } catch (error2) {
        const code2 =
          error2 && typeof error2 === "object" && "code" in error2 ? String(error2.code) : null;
        if (code2 === "ENOENT") return;
        throw error2;
      }
      return;
    }
    throw error;
  } finally {
    await fs.promises.rm(tmp, { force: true });
  }
};

export const saveSessionStore = async (storePath: string, store: SessionStoreRecord): Promise<void> => {
  await withSessionStoreLock(storePath, async () => {
    await saveSessionStoreUnlocked(storePath, store);
  });
};

export const updateSessionStore = async <T>(
  storePath: string,
  mutator: (store: SessionStoreRecord) => Promise<T> | T
): Promise<T> =>
  await withSessionStoreLock(storePath, async () => {
    const store = loadSessionStore(storePath, { skipCache: true });
    const result = await mutator(store);
    await saveSessionStoreUnlocked(storePath, store);
    return result;
  });

type SessionStoreLockOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
  staleMs?: number;
};

const withSessionStoreLock = async <T>(
  storePath: string,
  fn: () => Promise<T>,
  opts: SessionStoreLockOptions = {}
): Promise<T> => {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 25;
  const staleMs = opts.staleMs ?? 30_000;
  const lockPath = `${storePath}.lock`;
  const startedAt = Date.now();

  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });

  while (true) {
    try {
      const handle = await fs.promises.open(lockPath, "wx");
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() }), "utf-8");
      } catch {
        // best-effort
      }
      await handle.close();
      break;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : null;
      if (code === "ENOENT") {
        await fs.promises.mkdir(path.dirname(storePath), { recursive: true }).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        continue;
      }
      if (code !== "EEXIST") {
        throw error;
      }

      const now = Date.now();
      if (now - startedAt > timeoutMs) {
        throw new Error(`timeout acquiring session store lock: ${lockPath}`, { cause: error });
      }

      try {
        const stat = await fs.promises.stat(lockPath);
        const ageMs = now - stat.mtimeMs;
        if (ageMs > staleMs) {
          await fs.promises.unlink(lockPath);
          continue;
        }
      } catch {
        // ignore
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  try {
    return await fn();
  } finally {
    await fs.promises.unlink(lockPath).catch(() => undefined);
  }
};

export const getOrCreateSessionEntry = async (params: {
  storePath: string;
  sessionKey: string;
}): Promise<SessionEntry> =>
  updateSessionStore(params.storePath, (store) => {
    const existing = store[params.sessionKey];
    if (existing) {
      return existing;
    }
    const now = Date.now();
    const entry: SessionEntry = {
      sessionId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    store[params.sessionKey] = entry;
    return entry;
  });

export const updateSessionEntry = async (params: {
  storePath: string;
  sessionKey: string;
  update: (entry: SessionEntry) => Promise<Partial<SessionEntry> | null> | Partial<SessionEntry> | null;
}): Promise<SessionEntry | null> =>
  updateSessionStore(params.storePath, async (store) => {
    const existing = store[params.sessionKey];
    if (!existing) return null;
    const patch = await params.update(existing);
    if (!patch) return existing;
    const next = { ...existing, ...patch };
    store[params.sessionKey] = next;
    return next;
  });

export const updateLastRoute = async (params: {
  storePath: string;
  sessionKey: string;
  channel?: string;
  threadId?: string;
  userId?: string;
  messageTs?: string;
}): Promise<SessionEntry | null> =>
  updateSessionStore(params.storePath, (store) => {
    const existing = store[params.sessionKey];
    if (!existing) return null;
    const now = Date.now();
    const next: SessionEntry = {
      ...existing,
      updatedAt: Math.max(existing.updatedAt ?? 0, now),
      lastChannel: params.channel ?? existing.lastChannel,
      lastThreadId: params.threadId ?? existing.lastThreadId,
      lastUserId: params.userId ?? existing.lastUserId,
      lastMessageTs: params.messageTs ?? existing.lastMessageTs
    };
    store[params.sessionKey] = next;
    return next;
  });
