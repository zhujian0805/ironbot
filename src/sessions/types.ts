export type SessionEntry = {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  sessionFile?: string;
  lastChannel?: string;
  lastThreadId?: string;
  lastUserId?: string;
  lastMessageTs?: string;
};

export type SessionStoreRecord = Record<string, SessionEntry>;

export type TranscriptHeaderEntry = {
  type: "session";
  version: number;
  id: string;
  timestamp: string;
  cwd?: string;
};

export type TranscriptMessage = {
  role: "user" | "assistant";
  content: string | Array<{ type: "text"; text: string }>;
  timestamp?: number;
};

export type TranscriptMessageEntry = {
  type: "message";
  message: TranscriptMessage;
};

export type TranscriptEntry = TranscriptHeaderEntry | TranscriptMessageEntry;
