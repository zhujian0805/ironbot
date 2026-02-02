export const DEFAULT_AGENT_ID = "default";
export const DEFAULT_MAIN_SESSION_KEY = "main";

export type ParsedAgentSessionKey = {
  agentId: string;
  rest: string;
};

export function parseAgentSessionKey(sessionKey: string | undefined | null): ParsedAgentSessionKey | null {
  const raw = (sessionKey ?? "").trim();
  if (!raw) return null;
  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 3) return null;
  if (parts[0] !== "agent") return null;
  const agentId = parts[1]?.trim();
  const rest = parts.slice(2).join(":");
  if (!agentId || !rest) return null;
  return { agentId, rest };
}

export function isSubagentSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = (sessionKey ?? "").trim();
  if (!raw) return false;
  if (raw.toLowerCase().startsWith("subagent:")) return true;
  const parsed = parseAgentSessionKey(raw);
  return Boolean((parsed?.rest ?? "").toLowerCase().startsWith("subagent:"));
}

const THREAD_SESSION_MARKERS = [":thread:", ":topic:"];

export function resolveThreadParentSessionKey(sessionKey: string | undefined | null): string | null {
  const raw = (sessionKey ?? "").trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  let idx = -1;
  for (const marker of THREAD_SESSION_MARKERS) {
    const candidate = normalized.lastIndexOf(marker);
    if (candidate > idx) idx = candidate;
  }
  if (idx <= 0) return null;
  const parent = raw.slice(0, idx).trim();
  return parent ? parent : null;
}

export function toAgentRequestSessionKey(storeKey: string | undefined | null): string | undefined {
  const raw = (storeKey ?? "").trim();
  if (!raw) return undefined;
  return parseAgentSessionKey(raw)?.rest ?? raw;
}

export function normalizeAgentId(agentId: string | undefined | null): string {
  return (agentId ?? "").trim() || DEFAULT_AGENT_ID;
}

export function normalizeToken(token: string | undefined | null): string | undefined {
  const trimmed = (token ?? "").trim();
  return trimmed || undefined;
}

export function isMainSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = (sessionKey ?? "").trim();
  return !raw || raw === DEFAULT_MAIN_SESSION_KEY;
}

export function toAgentStoreSessionKey(params: {
  agentId: string;
  requestKey: string | undefined | null;
  mainKey?: string | undefined;
}): string {
  const raw = (params.requestKey ?? "").trim();
  if (!raw || raw === DEFAULT_MAIN_SESSION_KEY) {
    return buildAgentMainSessionKey({ agentId: params.agentId, mainKey: params.mainKey });
  }
  const lowered = raw.toLowerCase();
  if (lowered.startsWith("agent:")) return lowered;
  if (lowered.startsWith("subagent:")) {
    return `agent:${normalizeAgentId(params.agentId)}:${lowered}`;
  }
  return `agent:${normalizeAgentId(params.agentId)}:${lowered}`;
}

export function buildAgentMainSessionKey(params: { agentId: string; mainKey?: string }): string {
  const agentId = normalizeAgentId(params.agentId);
  const mainKey = normalizeToken(params.mainKey) || DEFAULT_MAIN_SESSION_KEY;
  return `agent:${agentId}:${mainKey}`;
}

export function resolveAgentIdFromSessionKey(sessionKey: string | undefined | null): string {
  const parsed = parseAgentSessionKey(sessionKey);
  return normalizeAgentId(parsed?.agentId ?? DEFAULT_AGENT_ID);
}

export type SessionKeyResult = {
  sessionKey: string;
  baseKey: string;
  threadId?: string;
  isMain: boolean;
};

export const deriveSlackSessionKey = (params: {
  channel?: string | null;
  threadTs?: string | null;
  ts?: string | null;
  isDirectMessage?: boolean;
  mainKey?: string;
  forceNewSession?: boolean;
  agentId?: string;
}): SessionKeyResult => {
  const channel = (params.channel ?? "").trim();
  const mainKey = params.mainKey ?? DEFAULT_MAIN_SESSION_KEY;
  const agentId = params.agentId ?? DEFAULT_AGENT_ID;
  const isDm = params.isDirectMessage ?? channel.startsWith("D");

  // If forcing a new session, create a unique session key
  if (params.forceNewSession) {
    const timestamp = Date.now();
    const uniqueId = `new-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
    return {
      sessionKey: `fresh:${uniqueId}`,
      baseKey: `fresh:${uniqueId}`,
      isMain: false
    };
  }

  if (isDm) {
    const channelKey = normalizeToken(channel) || "unknown";
    const baseKey = `dm:${channelKey}`;
    const threadId = params.threadTs?.trim();
    if (!threadId) {
      return { sessionKey: `agent:${agentId}:${baseKey}`, baseKey, isMain: false };
    }
    const normalizedThread = normalizeToken(threadId);
    return {
      sessionKey: `agent:${agentId}:${baseKey}:thread:${normalizedThread}`,
      baseKey,
      threadId: normalizedThread,
      isMain: false
    };
  }

  const channelKey = normalizeToken(channel) || "unknown";
  const baseKey = `slack:${channelKey}`;
  const threadId = params.threadTs?.trim();
  if (!threadId) {
    return { sessionKey: `agent:${agentId}:${baseKey}`, baseKey, isMain: false };
  }
  const normalizedThread = normalizeToken(threadId);
  return {
    sessionKey: `agent:${agentId}:${baseKey}:thread:${normalizedThread}`,
    baseKey,
    threadId: normalizedThread,
    isMain: false
  };
};
