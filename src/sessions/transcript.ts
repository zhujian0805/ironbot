import fs from "node:fs";
import path from "node:path";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { emitTranscriptAppended } from "./transcript_events.ts";
import { resolveSessionFilePath } from "./paths.ts";
import type { SessionEntry, TranscriptMessage, TranscriptMessageEntry, TranscriptHeaderEntry } from "./types.ts";
import { getOrCreateSessionEntry, updateSessionEntry } from "./store.ts";

const CURRENT_SESSION_VERSION = 2;

const buildHeader = (sessionId: string): TranscriptHeaderEntry => ({
  type: "session",
  version: CURRENT_SESSION_VERSION,
  id: sessionId,
  timestamp: new Date().toISOString(),
  cwd: process.cwd()
});

const ensureSessionHeader = async (sessionFile: string, sessionId: string): Promise<void> => {
  try {
    await fs.promises.access(sessionFile, fs.constants.F_OK);
    return;
  } catch {
    // continue to write
  }

  await fs.promises.mkdir(path.dirname(sessionFile), { recursive: true });
  const header = buildHeader(sessionId);
  await fs.promises.writeFile(sessionFile, `${JSON.stringify(header)}\n`, "utf-8");
};

export const resolveSessionTranscript = async (params: {
  storePath: string;
  sessionKey: string;
  agentId?: string;
  transcriptsDir?: string;
}): Promise<{ entry: SessionEntry; sessionFile: string }> => {
  const entry = await getOrCreateSessionEntry({ storePath: params.storePath, sessionKey: params.sessionKey });
  const sessionFile = params.transcriptsDir
    ? path.join(params.transcriptsDir, `${entry.sessionId}.jsonl`)
    : resolveSessionFilePath(entry.sessionId, entry, { agentId: params.agentId });

  if (!entry.sessionFile || entry.sessionFile !== sessionFile) {
    await updateSessionEntry({
      storePath: params.storePath,
      sessionKey: params.sessionKey,
      update: () => ({ sessionFile })
    });
  }

  return { entry, sessionFile };
};

export const appendTranscriptMessage = async (params: {
  storePath: string;
  sessionKey: string;
  role: "user" | "assistant";
  content: string;
  agentId?: string;
  transcriptsDir?: string;
}): Promise<void> => {
  const { entry, sessionFile } = await resolveSessionTranscript({
    storePath: params.storePath,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    transcriptsDir: params.transcriptsDir
  });

  await ensureSessionHeader(sessionFile, entry.sessionId);

  const message: TranscriptMessage = {
    role: params.role,
    content: [{ type: "text", text: params.content }],
    timestamp: Date.now()
  };
  const record: TranscriptMessageEntry = { type: "message", message };
  await fs.promises.appendFile(sessionFile, `${JSON.stringify(record)}\n`, "utf-8");
  emitTranscriptAppended({
    sessionKey: params.sessionKey,
    sessionId: entry.sessionId,
    sessionFile,
    message
  });
};

export const loadTranscriptHistory = async (params: {
  sessionFile: string;
  maxMessages?: number;
}): Promise<MessageParam[]> => {
  try {
    const raw = await fs.promises.readFile(params.sessionFile, "utf-8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const messages: MessageParam[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as TranscriptMessageEntry;
        if (parsed?.type !== "message" || !parsed.message) continue;
        const role = parsed.message.role;
        if (role !== "user" && role !== "assistant") continue;
        messages.push({ role, content: parsed.message.content });
      } catch {
        // ignore parse errors
      }
    }

    if (params.maxMessages && messages.length > params.maxMessages) {
      return messages.slice(-params.maxMessages);
    }
    return messages;
  } catch {
    return [];
  }
};
