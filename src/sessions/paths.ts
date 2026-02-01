import os from "node:os";
import path from "node:path";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "./session_key.ts";
import type { SessionEntry } from "./types.ts";

const DEFAULT_STATE_DIRNAME = ".ironbot";

export const resolveUserPath = (input: string, homedir: () => string = os.homedir): string => {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, homedir());
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
};

export const resolveStateDir = (
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir
): string => {
  const override = env.IRONBOT_STATE_DIR?.trim() || env.OPENCLAW_STATE_DIR?.trim();
  if (override) return resolveUserPath(override, homedir);
  return path.join(homedir(), DEFAULT_STATE_DIRNAME);
};

export const resolveAgentSessionsDir = (
  agentId: string = DEFAULT_AGENT_ID,
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir
): string => {
  const stateDir = resolveStateDir(env, homedir);
  return path.join(stateDir, "agents", normalizeAgentId(agentId), "sessions");
};

export const resolveSessionTranscriptsDir = (
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir
): string => resolveAgentSessionsDir(DEFAULT_AGENT_ID, env, homedir);

export const resolveSessionTranscriptsDirForAgent = (
  agentId: string = DEFAULT_AGENT_ID,
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir
): string => resolveAgentSessionsDir(agentId, env, homedir);

export const resolveDefaultSessionStorePath = (agentId: string = DEFAULT_AGENT_ID): string =>
  path.join(resolveAgentSessionsDir(agentId), "sessions.json");

export const resolveSessionTranscriptPath = (
  sessionId: string,
  agentId: string = DEFAULT_AGENT_ID,
  topicId?: string | number
): string => {
  const safeTopicId =
    typeof topicId === "string"
      ? encodeURIComponent(topicId)
      : typeof topicId === "number"
        ? String(topicId)
        : undefined;
  const fileName = safeTopicId !== undefined ? `${sessionId}-topic-${safeTopicId}.jsonl` : `${sessionId}.jsonl`;
  return path.join(resolveAgentSessionsDir(agentId), fileName);
};

export const resolveSessionFilePath = (
  sessionId: string,
  entry?: SessionEntry,
  opts?: { agentId?: string }
): string => {
  const candidate = entry?.sessionFile?.trim();
  return candidate ? candidate : resolveSessionTranscriptPath(sessionId, opts?.agentId);
};

export const resolveStorePath = (store?: string, opts?: { agentId?: string }): string => {
  const agentId = normalizeAgentId(opts?.agentId ?? DEFAULT_AGENT_ID);
  if (!store) {
    return resolveDefaultSessionStorePath(agentId);
  }
  if (store.includes("{agentId}")) {
    const expanded = store.replaceAll("{agentId}", agentId);
    return resolveUserPath(expanded);
  }
  return resolveUserPath(store);
};
