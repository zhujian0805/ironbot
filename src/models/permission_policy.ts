export type GlobalSettings = {
  defaultDeny: boolean;
  logDenials: boolean;
};

export type ToolRestriction = {
  allowedCommands: string[];
  blockedCommands: string[];
  allowedPaths: string[];
  timeoutMax?: number;
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
};

export type PermissionPolicy = {
  version: string;
  settings: GlobalSettings;
  tools: ToolPermissions;
  skills: SkillPermissions;
  mcps: McpPermissions;
  resources: ResourceDenyRules;
};
