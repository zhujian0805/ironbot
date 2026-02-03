import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { logger } from "../utils/logging.ts";
import { getPermissionManager, type PermissionManager } from "./permission_manager.ts";

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
  documentation?: string; // Pre-formatted documentation extracted from SKILL.md
}

export class SkillLoader {
  private readonly skillDirs: string[];
  private skills: Record<string, SkillInfo> = {};

  constructor(skillDirs: string[]) {
    this.skillDirs = Array.from(
      new Set(skillDirs.filter(Boolean).map((dir) => path.resolve(dir)))
    );
  }

  async loadSkills(): Promise<Record<string, SkillHandler>> {
    if (!this.skillDirs.length) {
      logger.warn("[SKILL-FLOW] No skill directories configured; skipping skill loading");
      return {};
    }

    logger.debug({ skillDirs: this.skillDirs }, "[SKILL-FLOW] Starting skill loading process");

    const permissionManager = getPermissionManager();
    logger.debug({ hasPermissionManager: Boolean(permissionManager) }, "[SKILL-FLOW] Permission manager status");

    for (const skillsDir of this.skillDirs) {
      await this.scanSkillsDirectory(skillsDir, permissionManager);
    }

    logger.info(
      {
        loadedSkills: Object.keys(this.skills),
        totalCount: Object.keys(this.skills).length
      },
      "[SKILL-FLOW] Skill loading process completed"
    );

    return Object.fromEntries(
      Object.entries(this.skills).map(([name, info]) => [name, info.handler])
    );
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

  private async scanSkillsDirectory(skillsDir: string, permissionManager: PermissionManager | null): Promise<void> {
    try {
      await fs.mkdir(skillsDir, { recursive: true });
    } catch (error) {
      logger.warn({ error, skillsDir }, "[SKILL-FLOW] Failed to ensure skills directory exists");
    }

    let entries: Dirent[];
    try {
      entries = await fs.readdir(skillsDir, { withFileTypes: true });
      logger.debug({ directory: skillsDir, entryCount: entries.length }, "[SKILL-FLOW] Scanning directory for skills");
    } catch (error) {
      logger.warn({ error, skillsDir }, "[SKILL-FLOW] Skills directory not available or accessible");
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith("_")) continue;
      const entryPath = path.join(skillsDir, entry.name);
      if (entry.isDirectory()) {
        await this.loadSkillDirectory(entryPath, permissionManager);
      } else if (entry.isFile()) {
        await this.loadSkillFile(entryPath, permissionManager);
      }
    }
  }

  private async loadSkillDirectory(skillDir: string, permissionManager: PermissionManager | null): Promise<void> {
    const skillName = path.basename(skillDir);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    logger.debug({ skillName, skillDir }, "[SKILL-FLOW] Checking skill directory");

    if (permissionManager && !permissionManager.isSkillAllowed(skillName)) {
      logger.info({ skillName, skillDir }, "[SKILL-FLOW] Skill directory blocked by permission config - not loading");
      return;
    }

    try {
      await fs.access(skillMdPath);
    } catch {
      logger.debug({ skillName, skillDir }, "[SKILL-FLOW] Directory does not contain accessible SKILL.md, skipping");
      return;
    }

    const skillMdContent = await fs.readFile(skillMdPath, "utf-8");
    const metadata = this.parseFrontmatter(skillMdContent) || undefined;
    const triggers = metadata ? this.extractTriggersFromMetadata(metadata) : this.extractTriggersFromName(skillName);
    logger.debug({ skillName, hasMetadata: !!metadata, triggerCount: triggers.length }, "[SKILL-FLOW] Parsed skill metadata and triggers");
    const relativePath = path.relative(process.cwd(), skillDir) || skillDir;
    const description = metadata?.description?.trim() || "No description provided.";
    const formattedDocumentation = `**Skill:** ${skillName}\n**Description:** ${description}\n**Location:** ${relativePath}\n\n${skillMdContent}`;

    if (this.skills[skillName]) {
      logger.warn({ skillName, existing: this.skills[skillName].skillDirectory, candidate: skillDir }, "[SKILL-FLOW] Duplicate skill name detected; skipping directory");
      return;
    }

    const handler: SkillHandler = async (input: string) => {
      try {
        logger.debug({ skillName }, "[SKILL-FLOW] Executing skill directory handler");
        logger.debug({ skillName, contentLength: skillMdContent.length }, "[SKILL-FLOW] Successfully read SKILL.md content");
        return `${formattedDocumentation}\n\n*Input:* ${input}`;
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
      skillDirectory: skillDir,
      documentation: formattedDocumentation
    };

    logger.info({ skillName, skillDir, triggerCount: triggers.length }, "[SKILL-FLOW] Successfully loaded SKILL.md-based documentation skill from directory");
  }

  private async loadSkillFile(filePath: string, permissionManager: PermissionManager | null): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    if (![".js", ".ts", ".mjs", ".cjs"].includes(ext)) {
      logger.debug({ filePath, extension: ext }, "[SKILL-FLOW] Skipping file with unsupported extension");
      return;
    }

    const skillName = path.basename(filePath, ext);
    if (skillName.startsWith("_")) {
      logger.debug({ skillName }, "[SKILL-FLOW] Skipping underscore-prefixed skill file");
      return;
    }

    if (permissionManager && !permissionManager.isSkillAllowed(skillName)) {
      logger.info({ skillName, filePath }, "[SKILL-FLOW] Skill file blocked by permission config - not loading");
      return;
    }

    if (this.skills[skillName]) {
      logger.warn({ skillName, existing: this.skills[skillName].skillDirectory, filePath }, "[SKILL-FLOW] Duplicate skill name detected; skipping file");
      return;
    }

    try {
      logger.debug({ skillName, filePath }, "[SKILL-FLOW] Importing skill module");
      const skillUrl = pathToFileURL(filePath);
      const module = await import(skillUrl.href);
      const handler = module.executeSkill as SkillHandler | undefined;
      if (typeof handler !== "function") {
        logger.warn({ skillName, filePath, hasExecuteSkill: "executeSkill" in module }, "[SKILL-FLOW] Skill file missing executeSkill function");
        return;
      }

      this.skills[skillName] = {
        name: skillName,
        handler,
        triggers: this.extractTriggersFromName(skillName),
        isDocumentationSkill: false
      };

      logger.info({ skillName, filePath }, "[SKILL-FLOW] Successfully loaded skill from file");
    } catch (error) {
      const errorObj = error as Error;
      logger.error(
        { error, errorType: typeof error, errorMessage: errorObj?.message, errorStack: errorObj?.stack, skillName, filePath },
        "[SKILL-FLOW] Error loading skill from file"
      );
    }
  }
}
