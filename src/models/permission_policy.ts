export type PolicyEntry = {
  priority: number;
  name: string;
  desc: string;
};

export type PermissionPolicy = {
  tools: PolicyEntry[];
  mcps: PolicyEntry[];
  commands: PolicyEntry[];
  skills: PolicyEntry[];
  resurces: PolicyEntry[];
  resources?: PolicyEntry[];
};
