export type ToolDecision = "allowed" | "denied";

export type ToolRequest = {
  toolName: string;
  arguments: Record<string, unknown>;
  requestedResource?: string;
  decision?: ToolDecision;
  reason?: string;
};
