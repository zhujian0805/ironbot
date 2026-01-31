export type SkillDefinition = {
  name: string;
  description: string;
  inputs: Record<string, unknown>;
  permissions: string[];
};
