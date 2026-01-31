export type ClaudeMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ClaudeRequest = {
  model: string;
  messages: ClaudeMessage[];
  tools: Record<string, unknown>[];
  streaming: boolean;
};
