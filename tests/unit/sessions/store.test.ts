import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionStoreCacheForTest,
  getOrCreateSessionEntry,
  loadSessionStore,
  updateLastRoute,
  updateSessionEntry
} from "../../../src/sessions/store";

describe("session store helpers", () => {
  let tempDir: string;
  let storePath: string;
  let originalTtl: string | undefined;
  let originalOpenClaw: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ironbot-session-store-"));
    storePath = path.join(tempDir, "store.json");
    originalTtl = process.env.IRONBOT_SESSION_CACHE_TTL_MS;
    originalOpenClaw = process.env.OPENCLAW_SESSION_CACHE_TTL_MS;
    process.env.IRONBOT_SESSION_CACHE_TTL_MS = "60000";
    delete process.env.OPENCLAW_SESSION_CACHE_TTL_MS;
    clearSessionStoreCacheForTest();
  });

  afterEach(async () => {
    if (originalTtl === undefined) {
      delete process.env.IRONBOT_SESSION_CACHE_TTL_MS;
    } else {
      process.env.IRONBOT_SESSION_CACHE_TTL_MS = originalTtl;
    }
    if (originalOpenClaw === undefined) {
      delete process.env.OPENCLAW_SESSION_CACHE_TTL_MS;
    } else {
      process.env.OPENCLAW_SESSION_CACHE_TTL_MS = originalOpenClaw;
    }
    vi.restoreAllMocks();
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("treats missing or invalid files as empty stores and keeps caching consistent", async () => {
    expect(loadSessionStore(storePath)).toEqual({});

    await fs.promises.writeFile(storePath, "invalid-json", "utf-8");
    expect(loadSessionStore(storePath)).toEqual({});

    const initialPayload = JSON.stringify({
      alpha: { sessionId: "alpha", createdAt: 1, updatedAt: 1 }
    });
    await fs.promises.writeFile(storePath, initialPayload, "utf-8");

    const firstLoad = loadSessionStore(storePath);
    expect(firstLoad).toEqual({
      alpha: { sessionId: "alpha", createdAt: 1, updatedAt: 1 }
    });

    const cachedLoad = loadSessionStore(storePath);
    expect(cachedLoad).toEqual(firstLoad);
    expect(cachedLoad).not.toBe(firstLoad);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await fs.promises.writeFile(
      storePath,
      JSON.stringify({
        beta: { sessionId: "beta", createdAt: 2, updatedAt: 2 }
      }),
      "utf-8"
    );

    const refreshed = loadSessionStore(storePath);
    expect(refreshed).toEqual({
      beta: { sessionId: "beta", createdAt: 2, updatedAt: 2 }
    });
  });

  it("creates, patches, and updates route metadata for entries", async () => {
    const uuidSpy = vi.spyOn(crypto, "randomUUID").mockReturnValue("test-uuid");
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000);

    const entry = await getOrCreateSessionEntry({ storePath, sessionKey: "mystery" });
    expect(entry).toEqual({ sessionId: "test-uuid", createdAt: 1_000, updatedAt: 1_000 });

    nowSpy.mockReturnValue(2_000);
    const patched = await updateSessionEntry({
      storePath,
      sessionKey: "mystery",
      update: () => ({ lastChannel: "C123" })
    });
    expect(patched).toMatchObject({ sessionId: "test-uuid", lastChannel: "C123", updatedAt: 1_000 });

    const routeUpdated = await updateLastRoute({
      storePath,
      sessionKey: "mystery",
      channel: "C789",
      threadId: "T123",
      userId: "U1",
      messageTs: "1234567890.123"
    });
    expect(routeUpdated).toMatchObject({
      lastChannel: "C789",
      lastThreadId: "T123",
      lastUserId: "U1",
      lastMessageTs: "1234567890.123",
      updatedAt: 2_000
    });

    const missingUpdate = await updateSessionEntry({
      storePath,
      sessionKey: "does-not-exist",
      update: () => ({ sessionId: "nope" })
    });
    expect(missingUpdate).toBeNull();

    uuidSpy.mockRestore();
  });
});
