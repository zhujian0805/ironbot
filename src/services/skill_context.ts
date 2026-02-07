export type SkillContextSource = "slack" | "cli" | "other";

export interface SkillContext {
  source?: SkillContextSource;
  channel?: string;
  threadTs?: string;
  messageTs?: string;
  userId?: string;
  [key: string]: unknown;
}
