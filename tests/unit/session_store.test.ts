import { describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getOrCreateSessionEntry, loadSessionStore, updateLastRoute } from "../../src/sessions/store.js";

describe("session store", () => {
  it("creates and updates a session entry", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-session-store-"));
    const storePath = join(dir, "sessions.json");
    const sessionKey = "slack:c1:thread:123";

    const entry = await getOrCreateSessionEntry({ storePath, sessionKey });
    expect(entry.sessionId).toBeTruthy();

    const updated = await updateLastRoute({
      storePath,
      sessionKey,
      channel: "C1",
      threadId: "123",
      userId: "U1",
      messageTs: "999"
    });

    expect(updated?.lastChannel).toBe("C1");
    expect(updated?.lastUserId).toBe("U1");

    const store = loadSessionStore(storePath);
    expect(store[sessionKey]?.lastThreadId).toBe("123");

    const raw = await readFile(storePath, "utf-8");
    expect(raw).toContain(sessionKey);

    await rm(dir, { recursive: true, force: true });
  });
});
