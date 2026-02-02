import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { logger } from "../utils/logging.ts";
import { getPermissionManager } from "./permission_manager.ts";

export type SkillHandler = (input: string) => string | Promise<string>;

export interface SkillMetadata {
  name?: string;
  description?: string;
  homepage?: string;
  metadata?: {
    openclaw?: {
      emoji?: string;
      requires?: {
        bins?: string[];
      };
      triggers?: string[];
    };
  };
}

export interface SkillInfo {
  name: string;
  handler: SkillHandler;
  metadata?: SkillMetadata;
  triggers?: string[];
  isDocumentationSkill?: boolean; // True for SKILL.md-based skills that provide instructions
  skillDirectory?: string; // Path to skill directory for SKILL.md-based skills
}

export class SkillLoader {
  private skillsDir: string;
  private skills: Record<string, SkillInfo> = {};

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  async loadSkills(): Promise<Record<string, SkillHandler>> {
    logger.debug({ directory: this.skillsDir, absolutePath: path.resolve(this.skillsDir) }, "[SKILL-FLOW] Starting skill loading process");

    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      logger.debug({ skillCount: entries.length, entries: entries.map(e => ({ name: e.name, type: e.isFile() ? 'file' : 'directory' })) }, "[SKILL-FLOW] Found entries in skills directory");

      const permissionManager = getPermissionManager();
      logger.debug({ hasPermissionManager: Boolean(permissionManager) }, "[SKILL-FLOW] Permission manager status");
      // Continue loading even if permission manager is not initialized - individual checks will handle it

      for (const entry of entries) {
        logger.debug({ entryName: entry.name, entryType: entry.isFile() ? 'file' : 'directory' }, "[SKILL-FLOW] Processing entry");
        if (entry.name.startsWith("_")) {
          logger.debug({ entryName: entry.name }, "[SKILL-FLOW] Skipping entry starting with underscore");
          continue;
        }

        if (entry.isDirectory()) {
          // Check if it's a skill directory with SKILL.md
          logger.debug({ directoryName: entry.name }, "[SKILL-FLOW] Processing directory entry");
          await this.loadSkillFromDirectory(path.join(this.skillsDir, entry.name), permissionManager);
        } else if (entry.isFile()) {
          // Load traditional .ts/.js skill files
          const ext = path.extname(entry.name);
          if (!['.js', '.ts', '.mjs', '.cjs'].includes(ext)) {
            logger.debug({ fileName: entry.name, extension: ext }, "[SKILL-FLOW] Skipping file with unsupported extension");
            continue;
          }

          const skillName = path.basename(entry.name, ext);
          logger.debug({ skillName, fileName: entry.name }, "[SKILL-FLOW] Checking if skill is allowed by permissions");
          if (permissionManager && !permissionManager.isSkillAllowed(skillName)) {
            logger.info({ skillName, fileName: entry.name }, "[SKILL-FLOW] Skill blocked by permission config - not loading");
            continue;
          }

          logger.debug({ skillName, fileName: entry.name }, "[SKILL-FLOW] Skill is allowed, attempting to load");

          const skillPath = path.join(this.skillsDir, entry.name);
          try {
            logger.debug({ skillName, skillPath }, "[SKILL-FLOW] Importing skill module");
            const skillUrl = pathToFileURL(skillPath);
            const module = await import(skillUrl.href);
            const handler = module.executeSkill as SkillHandler | undefined;

            if (typeof handler === "function") {
              this.skills[skillName] = {
                name: skillName,
                handler,
                triggers: this.extractTriggersFromName(skillName),
                isDocumentationSkill: false
              };
              logger.info({ skillName, skillPath }, "[SKILL-FLOW] Successfully loaded skill from file");
            } else {
              logger.warn({ skillName, skillPath, hasExecuteSkill: 'executeSkill' in module }, "[SKILL-FLOW] Skill file missing executeSkill function");
            }
          } catch (error) {
            const errorObj = error as Error;
            logger.error({ error, errorType: typeof error, errorMessage: errorObj?.message, errorStack: errorObj?.stack, skillName, skillPath }, "[SKILL-FLOW] Error loading skill from file");
          }
        }
      }

      logger.info({ loadedSkills: Object.keys(this.skills), totalCount: Object.keys(this.skills).length }, "[SKILL-FLOW] Skill loading process completed");
      return Object.fromEntries(Object.entries(this.skills).map(([name, info]) => [name, info.handler]));
    } catch (error) {
      logger.warn({ error, directory: this.skillsDir }, "[SKILL-FLOW] Skills directory not available or accessible");
      return {};
    }
  }

  getSkillInfo(): Record<string, SkillInfo> {
    return this.skills;
  }

  private parseFrontmatter(content: string): SkillMetadata | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!frontmatterMatch) return null;

    try {
      // Simple YAML-like parsing (basic implementation)
      const frontmatter = frontmatterMatch[1];
      const metadata: SkillMetadata = {};

      // Parse basic key-value pairs
      const lines = frontmatter.split('\n').map(line => line.trim()).filter(line => line);
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();

          if (key === 'name') metadata.name = value;
          else if (key === 'description') metadata.description = value;
          else if (key === 'homepage') metadata.homepage = value;
          else if (key === 'metadata') {
            try {
              // Try to parse JSON metadata
              metadata.metadata = JSON.parse(value);
            } catch {
              // Ignore invalid JSON
            }
          }
        }
      }

      return metadata;
    } catch (error) {
      logger.warn({ error }, "[SKILL-FLOW] Failed to parse frontmatter");
      return null;
    }
  }

  private extractTriggersFromMetadata(metadata: SkillMetadata): string[] {
    const triggers: string[] = [];

    // Extract from openclaw metadata
    if (metadata.metadata?.openclaw?.triggers) {
      triggers.push(...metadata.metadata.openclaw.triggers);
    }

    // Extract from description keywords
    if (metadata.description) {
      const description = metadata.description.toLowerCase();
      // Add common trigger words found in descriptions
      if (description.includes('install')) triggers.push('install');
      if (description.includes('setup')) triggers.push('setup');
      if (description.includes('weather')) triggers.push('weather');
      if (description.includes('finance') || description.includes('stock')) triggers.push('finance', 'stock');
      if (description.includes('email')) triggers.push('email');
      if (description.includes('calendar')) triggers.push('calendar');
    }

    return [...new Set(triggers)]; // Remove duplicates
  }

  private extractTriggersFromName(skillName: string): string[] {
    const triggers: string[] = [];
    const name = skillName.toLowerCase();

    // Generate triggers based on skill name
    if (name.includes('install') || name.includes('skill_installer')) {
      triggers.push('install', 'setup', 'add skill', 'install skill');
    } else if (name.includes('permission') || name.includes('check')) {
      triggers.push('what skills', 'permission', 'access', 'can I', 'skills');
    } else if (name.includes('weather')) {
      triggers.push('weather', 'forecast');
    } else if (name.includes('finance') || name.includes('yahoo')) {
      triggers.push('finance', 'stock', 'market');
    } else if (name.includes('email')) {
      triggers.push('email');
    } else if (name.includes('calendar')) {
      triggers.push('calendar', 'schedule');
    }

    // Add the skill name itself as a trigger
    triggers.push(skillName);

    return [...new Set(triggers)]; // Remove duplicates
  }

  private async loadSkillFromDirectory(skillDir: string, permissionManager: any): Promise<void> {
    const skillName = path.basename(skillDir);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    logger.debug({ skillName, skillDir }, "[SKILL-FLOW] Checking skill directory");

    try {
      // Check if SKILL.md exists
      await fs.access(skillMdPath);
      logger.debug({ skillName, skillMdPath }, "[SKILL-FLOW] SKILL.md file found, checking permissions");

      if (!permissionManager.isSkillAllowed(skillName)) {
        logger.info({ skillName, skillDir }, "[SKILL-FLOW] Skill directory blocked by permission config - not loading");
        return;
      }

      logger.debug({ skillName }, "[SKILL-FLOW] Skill directory is allowed, parsing metadata");

      // Read and parse SKILL.md content
      const skillMdContent = await fs.readFile(skillMdPath, 'utf-8');
      const metadata = this.parseFrontmatter(skillMdContent) || undefined;
      const triggers = metadata ? this.extractTriggersFromMetadata(metadata) : this.extractTriggersFromName(skillName);

      logger.debug({ skillName, hasMetadata: !!metadata, triggerCount: triggers.length }, "[SKILL-FLOW] Parsed skill metadata and triggers");

      // Create a handler that provides the skill instructions
      const handler: SkillHandler = async (input: string) => {
        try {
          logger.debug({ skillName }, "[SKILL-FLOW] Executing skill directory handler");
          logger.debug({ skillName, contentLength: skillMdContent.length }, "[SKILL-FLOW] Successfully read SKILL.md content");
          return `**Skill: ${skillName}**\n\n${skillMdContent}\n\n*Input:* ${input}`;
        } catch (error) {
          logger.error({ error, skillName, skillMdPath }, "[SKILL-FLOW] Error reading SKILL.md content");
          return `Error loading skill ${skillName}: ${error instanceof Error ? error.message : String(error)}`;
        }
      };

      this.skills[skillName] = {
        name: skillName,
        handler,
        metadata,
        triggers,
        isDocumentationSkill: true,
        skillDirectory: skillDir
      };

      logger.info({ skillName, skillDir, triggerCount: triggers.length }, "[SKILL-FLOW] Successfully loaded SKILL.md-based documentation skill from directory");

    } catch (error) {
      // SKILL.md doesn't exist, skip this directory
      logger.debug({ skillName, skillDir }, "[SKILL-FLOW] Directory does not contain accessible SKILL.md, skipping");
    }
  }
}
