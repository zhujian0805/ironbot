export type ClaudeResponse = {
  content: string;
  toolCalls?: unknown[];
  usage?: Record<string, unknown>;
};
