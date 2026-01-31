import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { logger } from "../utils/logging.js";
import { watchFile, type WatchHandle } from "../utils/file_watcher.js";
import { validatePermissionPolicy } from "../validation/permission_policy.js";
import {
  type PermissionPolicy,
  type GlobalSettings,
  type ToolPermissions,
  type ToolRestriction,
  type SkillPermissions,
  type McpPermissions,
  type McpSettings,
  type ResourceDenyRules
} from "../models/permission_policy.js";

export type PermissionCheckResult = {
  allowed: boolean;
  reason: string;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
};

const defaultSettings = (): GlobalSettings => ({
  defaultDeny: true,
  logDenials: true
});

const defaultPolicy = (): PermissionPolicy => ({
  version: "1.0",
  settings: defaultSettings(),
  tools: { allowed: [], restrictions: {} },
  skills: { allowed: [] },
  mcps: { allowed: [], settings: {} },
  resources: { deniedPaths: [] }
});

const escapeRegex = (input: string): string =>
  input.replace(/[.+^${}()|[\]\\]/g, "\\$&");

const patternToRegex = (pattern: string): RegExp => {
  const escaped = escapeRegex(pattern)
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
};

export class PermissionManager {
  private configPath: string;
  private config: PermissionPolicy;
  private loaded = false;
  private watcher?: WatchHandle;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.config = defaultPolicy();
  }

  loadConfig(): boolean {
    if (!fs.existsSync(this.configPath)) {
      logger.warn({ path: this.configPath }, "Permission config not found; using default deny");
      this.config = defaultPolicy();
      this.loaded = true;
      return false;
    }

    try {
      const rawContent = fs.readFileSync(this.configPath, "utf-8");
      const raw = parseYaml(rawContent);

      if (!raw) {
        logger.warn({ path: this.configPath }, "Permission config empty; using default deny");
        this.config = defaultPolicy();
        this.loaded = true;
        return false;
      }

      validatePermissionPolicy(raw);

      this.config = this.parseConfig(raw as Record<string, unknown>);
      this.loaded = true;
      logger.info(
        {
          tools: this.config.tools.allowed.length,
          skills: this.config.skills.allowed.length,
          mcps: this.config.mcps.allowed.length
        },
        "Loaded permission config"
      );
      return true;
    } catch (error) {
      logger.error({ error }, "Error loading permission config; using default deny");
      this.config = defaultPolicy();
      this.loaded = true;
      return false;
    }
  }

  private parseConfig(raw: Record<string, unknown>): PermissionPolicy {
    const rawSettings = (raw.settings ?? {}) as Record<string, unknown>;
    const settings: GlobalSettings = {
      defaultDeny: Boolean(rawSettings.default_deny ?? true),
      logDenials: Boolean(rawSettings.log_denials ?? true)
    };

    const rawTools = (raw.tools ?? {}) as Record<string, unknown>;
    const restrictions: Record<string, ToolRestriction> = {};
    const rawRestrictions = (rawTools.restrictions ?? {}) as Record<string, unknown>;
    for (const [toolName, restrictionValue] of Object.entries(rawRestrictions)) {
      const restriction = restrictionValue as Record<string, unknown>;
      restrictions[toolName] = {
        allowedCommands: toStringArray(restriction.allowed_commands),
        blockedCommands: toStringArray(restriction.blocked_commands),
        allowedPaths: toStringArray(restriction.allowed_paths),
        timeoutMax:
          typeof restriction.timeout_max === "number"
            ? restriction.timeout_max
            : undefined
      };
    }

    const tools: ToolPermissions = {
      allowed: toStringArray(rawTools.allowed),
      restrictions
    };

    const rawSkills = (raw.skills ?? {}) as Record<string, unknown>;
    const skills: SkillPermissions = {
      allowed: toStringArray(rawSkills.allowed)
    };

    const rawMcps = (raw.mcps ?? {}) as Record<string, unknown>;
    const mcpSettings: Record<string, McpSettings> = {};
    const rawMcpSettings = (rawMcps.settings ?? {}) as Record<string, unknown>;
    for (const [mcpName, settingsValue] of Object.entries(rawMcpSettings)) {
      const settingsRaw = settingsValue as Record<string, unknown>;
      mcpSettings[mcpName] = {
        allowedPaths: toStringArray(settingsRaw.allowed_paths),
        allowedRepos: toStringArray(settingsRaw.allowed_repos)
      };
    }

    const mcps: McpPermissions = {
      allowed: toStringArray(rawMcps.allowed),
      settings: mcpSettings
    };

    const rawResources = (raw.resources ?? {}) as Record<string, unknown>;
    const resources: ResourceDenyRules = {
      deniedPaths: toStringArray(rawResources.denied_paths)
    };

    return {
      version: typeof raw.version === "string" ? raw.version : "1.0",
      settings,
      tools,
      skills,
      mcps,
      resources
    };
  }

  private matchesPattern(name: string, patterns: string[]): boolean {
    if (!name) return false;
    return patterns.some((pattern) => patternToRegex(pattern).test(name));
  }

  private findMatchingPattern(name: string, patterns: string[]): string | undefined {
    if (!name) return undefined;
    for (const pattern of patterns) {
      if (patternToRegex(pattern).test(name)) return pattern;
    }
    return undefined;
  }

  isToolAllowed(toolName: string): boolean {
    if (!toolName) return false;
    const allowed = this.matchesPattern(toolName, this.config.tools.allowed);
    if (!allowed && this.config.settings.logDenials) {
      logger.warn({ toolName }, "Permission denied for tool");
    }
    return allowed;
  }

  isSkillAllowed(skillName: string): boolean {
    if (!skillName) return false;
    const allowed = this.matchesPattern(skillName, this.config.skills.allowed);
    if (!allowed && this.config.settings.logDenials) {
      logger.warn({ skillName }, "Permission denied for skill");
    }
    return allowed;
  }

  isMcpAllowed(mcpName: string): boolean {
    if (!mcpName) return false;
    const allowed = this.matchesPattern(mcpName, this.config.mcps.allowed);
    if (!allowed && this.config.settings.logDenials) {
      logger.warn({ mcpName }, "Permission denied for mcp");
    }
    return allowed;
  }

  getDeniedResourcePattern(resourcePath: string): string | undefined {
    if (!resourcePath) return undefined;
    const normalized = resourcePath.replace(/\\/g, "/");
    return (
      this.findMatchingPattern(normalized, this.config.resources.deniedPaths) ??
      this.findMatchingPattern(resourcePath, this.config.resources.deniedPaths)
    );
  }

  checkResourceDenied(resourcePath: string): boolean {
    if (!resourcePath) return false;
    const match = this.getDeniedResourcePattern(resourcePath);
    if (match && this.config.settings.logDenials) {
      logger.warn({ resourcePath, rule: match }, "Permission denied for resource path");
    }
    return Boolean(match);
  }

  getToolRestrictions(toolName: string): ToolRestriction | undefined {
    return this.config.tools.restrictions[toolName];
  }

  checkPermission(
    capabilityType: "tool" | "skill" | "mcp",
    name: string,
    resourcePath?: string
  ): PermissionCheckResult {
    const result: PermissionCheckResult = { allowed: false, reason: "" };

    if (capabilityType === "tool") {
      result.allowed = this.isToolAllowed(name);
      if (!result.allowed) result.reason = `Tool '${name}' is not in the allowed list`;
    } else if (capabilityType === "skill") {
      result.allowed = this.isSkillAllowed(name);
      if (!result.allowed) result.reason = `Skill '${name}' is not in the allowed list`;
    } else if (capabilityType === "mcp") {
      result.allowed = this.isMcpAllowed(name);
      if (!result.allowed) result.reason = `MCP '${name}' is not in the allowed list`;
    }

    if (result.allowed && resourcePath) {
      const deniedPattern = this.getDeniedResourcePattern(resourcePath);
      if (deniedPattern) {
        result.allowed = false;
        result.reason = `Resource path '${resourcePath}' is denied by rule '${deniedPattern}'`;
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
      tools: [...this.config.tools.allowed],
      skills: [...this.config.skills.allowed],
      mcps: [...this.config.mcps.allowed]
    };
  }

  reloadConfig(): boolean {
    const previous = this.config;
    try {
      const loaded = this.loadConfig();
      logger.info("Permission configuration reloaded successfully");
      return loaded;
    } catch (error) {
      this.config = previous;
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
