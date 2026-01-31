import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendTranscriptMessage, loadTranscriptHistory, resolveSessionTranscript } from "../../src/sessions/transcript.js";

describe("transcripts", () => {
  it("writes a session header and appends messages", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-transcript-"));
    const storePath = join(dir, "sessions.json");
    const transcriptsDir = join(dir, "transcripts");
    const sessionKey = "main";

    await appendTranscriptMessage({
      storePath,
      sessionKey,
      transcriptsDir,
      role: "user",
      content: "Hello"
    });
    await appendTranscriptMessage({
      storePath,
      sessionKey,
      transcriptsDir,
      role: "assistant",
      content: "Hi there"
    });

    const session = await resolveSessionTranscript({ storePath, sessionKey, transcriptsDir });
    const raw = await readFile(session.sessionFile, "utf-8");
    const lines = raw.trim().split(/\r?\n/);

    const header = JSON.parse(lines[0]);
    expect(header.type).toBe("session");

    const history = await loadTranscriptHistory({ sessionFile: session.sessionFile, maxMessages: 10 });
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe("user");
    expect(history[1].role).toBe("assistant");

    await rm(dir, { recursive: true, force: true });
  });
});
