export type GlobalSettings = {
  defaultDeny: boolean;
  logDenials: boolean;
  enableOverridePrompt?: boolean;
};

export type ToolRestriction = {
  allowedCommands: string[];
  blockedCommands: string[];
  allowedPaths: string[];
  timeoutMax?: number;
  overridePrompt?: boolean;
};

export type ToolPermissions = {
  allowed: string[];
  restrictions: Record<string, ToolRestriction>;
};

export type SkillPermissions = {
  allowed: string[];
};

export type McpSettings = {
  allowedPaths: string[];
  allowedRepos: string[];
};

export type McpPermissions = {
  allowed: string[];
  settings: Record<string, McpSettings>;
};

export type ResourceDenyRules = {
  deniedPaths: string[];
  deniedPatterns?: string[];
};

export type PermissionPolicy = {
  version: string;
  settings: GlobalSettings;
  blockedCommands?: string[];
  tools: ToolPermissions;
  skills: SkillPermissions;
  mcps: McpPermissions;
  resources: ResourceDenyRules;
};
