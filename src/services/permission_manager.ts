import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { logger } from "../utils/logging.ts";
import { watchFile, type WatchHandle } from "../utils/file_watcher.ts";
import { validatePermissionPolicy } from "../validation/permission_policy.ts";
import type { PermissionPolicy, PolicyEntry } from "../models/permission_policy.ts";

export type PermissionCheckResult = {
  allowed: boolean;
  reason: string;
};

const SECTION_KEYS = ["tools", "mcps", "commands", "skills", "resurces"] as const;

type PolicySectionKey = (typeof SECTION_KEYS)[number];

type CompiledPolicyEntry = PolicyEntry & {
  regex: RegExp;
};

const escapeRegex = (input: string): string =>
  input.replace(/[.+^${}()|[\]\\]/g, "\\$&");

const defaultPolicy = (): PermissionPolicy => ({
  tools: [],
  mcps: [],
  commands: [],
  skills: [],
  resurces: []
});

export class PermissionManager {
  private configPath: string;
  private config: PermissionPolicy;
  private compiledSections: Record<PolicySectionKey, CompiledPolicyEntry[]>;
  private loaded = false;
  private watcher?: WatchHandle;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.config = defaultPolicy();
    this.compiledSections = this.buildCompiledSections(this.config);
  }

  loadConfig(): boolean {
    if (!fs.existsSync(this.configPath)) {
      logger.warn({ path: this.configPath }, "Permission config not found; using default deny");
      this.config = defaultPolicy();
      this.compiledSections = this.buildCompiledSections(this.config);
      this.loaded = true;
      return false;
    }

    try {
      const rawContent = fs.readFileSync(this.configPath, "utf-8");
      const raw = parseYaml(rawContent);

      if (!raw) {
        logger.warn({ path: this.configPath }, "Permission config empty; using default deny");
        this.config = defaultPolicy();
        this.compiledSections = this.buildCompiledSections(this.config);
        this.loaded = true;
        return false;
      }

      const normalized = this.normalizePolicy(raw as Record<string, unknown>);
      this.config = normalized;
      this.compiledSections = this.buildCompiledSections(normalized);
      this.loaded = true;
      logger.info(
        {
          tools: this.config.tools.length,
          skills: this.config.skills.length,
          mcps: this.config.mcps.length,
          commands: this.config.commands.length,
          resurces: this.config.resurces.length
        },
        "Loaded permission config"
      );
      return true;
    } catch (error) {
      logger.error({ error }, "Error loading permission config; using default deny");
      this.config = defaultPolicy();
      this.compiledSections = this.buildCompiledSections(this.config);
      this.loaded = true;
      return false;
    }
  }

  private normalizePolicy(raw: Record<string, unknown>): PermissionPolicy {
    const parsed = validatePermissionPolicy(raw);
    const policy: PermissionPolicy = {
      tools: parsed.tools ?? [],
      mcps: parsed.mcps ?? [],
      commands: parsed.commands ?? [],
      skills: parsed.skills ?? [],
      resurces: parsed.resurces ?? parsed.resources ?? []
    };
    return policy;
  }

  private buildCompiledSections(policy: PermissionPolicy): Record<PolicySectionKey, CompiledPolicyEntry[]> {
    const compiled = {} as Record<PolicySectionKey, CompiledPolicyEntry[]>;
    for (const section of SECTION_KEYS) {
      compiled[section] = this.compileSection(policy[section]);
    }
    return compiled;
  }

  private compileSection(entries: PolicyEntry[]): CompiledPolicyEntry[] {
    return [...entries]
      .sort((a, b) => a.priority - b.priority)
      .map((entry) => this.compileEntry(entry));
  }

  private compileEntry(entry: PolicyEntry): CompiledPolicyEntry {
    let regex: RegExp;
    try {
      regex = new RegExp(entry.name);
    } catch (error) {
      logger.warn({ entry: entry.name, error }, "Invalid regex for permission entry, treating as literal");
      regex = new RegExp(`^${escapeRegex(entry.name)}$`);
    }
    return { ...entry, regex };
  }

  private findMatchingEntry(section: PolicySectionKey, value: string): CompiledPolicyEntry | undefined {
    if (!value) return undefined;
    for (const entry of this.compiledSections[section]) {
      if (entry.regex.test(value)) return entry;
    }
    return undefined;
  }

  private normalizeResourcePath(resourcePath: string): string {
    return resourcePath.replace(/\\/g, "/");
  }

  isToolAllowed(toolName: string): boolean {
    if (!toolName) return false;
    const allowed = Boolean(this.findMatchingEntry("tools", toolName));
    if (!allowed) {
      logger.warn({ toolName }, "Permission denied for tool");
    }
    return allowed;
  }

  isSkillAllowed(skillName: string): boolean {
    if (!skillName) return false;
    const allowed = Boolean(this.findMatchingEntry("skills", skillName));
    if (!allowed) {
      logger.warn({ skillName }, "Permission denied for skill");
    }
    return allowed;
  }

  isMcpAllowed(mcpName: string): boolean {
    if (!mcpName) return false;
    const allowed = Boolean(this.findMatchingEntry("mcps", mcpName));
    if (!allowed) {
      logger.warn({ mcpName }, "Permission denied for MCP");
    }
    return allowed;
  }

  isCommandAllowed(command: string): boolean {
    if (!command) return false;
    const allowed = Boolean(this.findMatchingEntry("commands", command));
    if (!allowed) {
      logger.warn({ command }, "Permission denied for command");
    }
    return allowed;
  }

  isResourceAllowed(resourcePath: string): boolean {
    if (!resourcePath) return false;
    const normalized = this.normalizeResourcePath(resourcePath);
    const match =
      this.findMatchingEntry("resurces", normalized) ?? this.findMatchingEntry("resurces", resourcePath);
    const allowed = Boolean(match);
    if (!allowed) {
      logger.warn({ resourcePath }, "Permission denied for resource path");
    }
    return allowed;
  }

  checkPermission(
    capabilityType: "tool" | "skill" | "mcp",
    name: string,
    resourcePath?: string
  ): PermissionCheckResult {
    const result: PermissionCheckResult = { allowed: false, reason: "" };
    if (capabilityType === "tool") {
      result.allowed = this.isToolAllowed(name);
      if (!result.allowed) result.reason = `Tool '${name}' is not in the allowed rules`;
    } else if (capabilityType === "skill") {
      result.allowed = this.isSkillAllowed(name);
      if (!result.allowed) result.reason = `Skill '${name}' is not in the allowed rules`;
    } else if (capabilityType === "mcp") {
      result.allowed = this.isMcpAllowed(name);
      if (!result.allowed) result.reason = `MCP '${name}' is not in the allowed rules`;
    }

    if (result.allowed && resourcePath) {
      if (!this.isResourceAllowed(resourcePath)) {
        result.allowed = false;
        result.reason = `Resource path '${resourcePath}' is not in the allowed rules`;
      }
    }

    return result;
  }

  formatDenialMessage(capabilityType: string, name: string, reason?: string): string {
    if (reason) return `Permission denied: ${reason}`;
    const label = capabilityType.charAt(0).toUpperCase() + capabilityType.slice(1);
    return `Permission denied: ${label} '${name}' is not enabled in the current configuration.`;
  }

  listAllowedCapabilities(): { tools: string[]; skills: string[]; mcps: string[] } {
    return {
      tools: this.config.tools.map((rule) => rule.name),
      skills: this.config.skills.map((rule) => rule.name),
      mcps: this.config.mcps.map((rule) => rule.name)
    };
  }

  listPolicyNames(section: keyof PermissionPolicy): string[] {
    const normalizedSection =
      section === "resources" ? "resurces" : (section as PolicySectionKey);
    const entries = this.config[normalizedSection];
    return entries?.map((rule) => rule.name) ?? [];
  }

  reloadConfig(): boolean {
    const previous = this.config;
    const previousCompiled = this.compiledSections;
    try {
      const loaded = this.loadConfig();
      logger.info("Permission configuration reloaded successfully");
      return loaded;
    } catch (error) {
      this.config = previous;
      this.compiledSections = previousCompiled;
      logger.error({ error }, "Failed to reload permission config, keeping previous");
      return false;
    }
  }

  startFileWatcher(debounceMs = 1000): boolean {
    if (this.watcher) return true;
    const configDir = path.dirname(path.resolve(this.configPath));
    this.watcher = watchFile(
      this.configPath,
      () => {
        logger.info({ path: this.configPath }, "Permission config file changed");
        this.reloadConfig();
      },
      (error) => {
        logger.error({ error }, "Permission watcher error");
      },
      { debounceMs }
    );
    logger.info({ directory: configDir }, "Permission config watcher started");
    return true;
  }

  stopFileWatcher(): void {
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = undefined;
      logger.info("Permission config watcher stopped");
    }
  }
}

let permissionManager: PermissionManager | null = null;

export const getPermissionManager = (): PermissionManager | null => permissionManager;

export const initPermissionManager = (configPath: string): PermissionManager => {
  permissionManager = new PermissionManager(configPath);
  permissionManager.loadConfig();
  return permissionManager;
};
