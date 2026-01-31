export const DEFAULT_AGENT_ID = "main";
export const DEFAULT_MAIN_SESSION_KEY = "main";

const VALID_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_CHARS_RE = /[^a-z0-9_-]+/g;
const LEADING_DASH_RE = /^-+/;
const TRAILING_DASH_RE = /-+$/;

const normalizeToken = (value: string | undefined | null): string => (value ?? "").trim().toLowerCase();

export const normalizeAgentId = (value: string | undefined | null): string => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_AGENT_ID;
  if (VALID_ID_RE.test(trimmed)) return trimmed.toLowerCase();
  return (
    trimmed
      .toLowerCase()
      .replace(INVALID_CHARS_RE, "-")
      .replace(LEADING_DASH_RE, "")
      .replace(TRAILING_DASH_RE, "")
      .slice(0, 64) || DEFAULT_AGENT_ID
  );
};

export const isMainSessionKey = (sessionKey: string | undefined | null, mainKey = DEFAULT_MAIN_SESSION_KEY): boolean =>
  normalizeToken(sessionKey) === normalizeToken(mainKey);

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
}): SessionKeyResult => {
  const channel = (params.channel ?? "").trim();
  const mainKey = params.mainKey ?? DEFAULT_MAIN_SESSION_KEY;
  const isDm = params.isDirectMessage ?? channel.startsWith("D");
  if (isDm) {
    return { sessionKey: mainKey, baseKey: mainKey, isMain: true };
  }

  const channelKey = normalizeToken(channel) || "unknown";
  const baseKey = `slack:${channelKey}`;
  const threadId = (params.threadTs ?? params.ts ?? "").trim();
  if (!threadId) {
    return { sessionKey: baseKey, baseKey, isMain: false };
  }
  const normalizedThread = normalizeToken(threadId);
  return {
    sessionKey: `${baseKey}:thread:${normalizedThread}`,
    baseKey,
    threadId: normalizedThread,
    isMain: false
  };
};
