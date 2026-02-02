import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { logger } from "../utils/logging.ts";
import { getPermissionManager } from "./permission_manager.ts";

export type SkillHandler = (input: string) => string | Promise<string>;

export class SkillLoader {
  private skillsDir: string;
  private skills: Record<string, SkillHandler> = {};

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  async loadSkills(): Promise<Record<string, SkillHandler>> {
    logger.debug({ directory: this.skillsDir }, "[SKILL-FLOW] Loading skills");

    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      const permissionManager = getPermissionManager();
      logger.debug({ hasPermissionManager: Boolean(permissionManager) }, "[SKILL-FLOW] Permission manager status");
      if (!permissionManager) {
        logger.warn("[SKILL-FLOW] Permission manager not initialized; skipping skill loading (deny-by-default)");
        return this.skills;
      }

      for (const entry of entries) {
        if (entry.name.startsWith("_")) continue;

        if (entry.isDirectory()) {
          // Check if it's a skill directory with SKILL.md
          await this.loadSkillFromDirectory(path.join(this.skillsDir, entry.name), permissionManager);
        } else if (entry.isFile()) {
          // Load traditional .ts/.js skill files
          const ext = path.extname(entry.name);
          if (!['.js', '.ts', '.mjs', '.cjs'].includes(ext)) continue;

          const skillName = path.basename(entry.name, ext);
          logger.debug({ skillName }, "[SKILL-FLOW] Checking if skill is allowed");
          if (!permissionManager.isSkillAllowed(skillName)) {
            logger.info({ skillName }, "[SKILL-FLOW] Skill blocked by permission config");
            continue;
          }
          logger.debug({ skillName }, "[SKILL-FLOW] Skill is allowed, loading...");

          const skillPath = path.join(this.skillsDir, entry.name);
          try {
            const module = await import(pathToFileURL(skillPath).href);
            const handler = module.executeSkill as SkillHandler | undefined;
            if (typeof handler === "function") {
              this.skills[skillName] = handler;
              logger.info({ skillName }, "Loaded skill");
            } else {
              logger.warn({ skillName }, "Skill missing executeSkill function");
            }
          } catch (error) {
            logger.error({ error, skillName }, "Error loading skill");
          }
        }
      }

      return this.skills;
    } catch (error) {
      logger.warn({ error, directory: this.skillsDir }, "Skills directory not available");
      return {};
    }
  }

  private async loadSkillFromDirectory(skillDir: string, permissionManager: any): Promise<void> {
    const skillName = path.basename(skillDir);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    try {
      // Check if SKILL.md exists
      await fs.access(skillMdPath);

      logger.debug({ skillName }, "[SKILL-FLOW] Checking if skill directory is allowed");
      if (!permissionManager.isSkillAllowed(skillName)) {
        logger.info({ skillName }, "[SKILL-FLOW] Skill directory blocked by permission config");
        return;
      }

      // Create a handler that provides the skill instructions
      const handler: SkillHandler = async (input: string) => {
        try {
          const skillMdContent = await fs.readFile(skillMdPath, 'utf-8');
          return `**Skill: ${skillName}**\n\n${skillMdContent}\n\n*Input:* ${input}`;
        } catch (error) {
          return `Error loading skill ${skillName}: ${error instanceof Error ? error.message : String(error)}`;
        }
      };

      this.skills[skillName] = handler;
      logger.info({ skillName }, "Loaded skill from directory");

    } catch (error) {
      // SKILL.md doesn't exist, skip this directory
      logger.debug({ skillName }, "Directory does not contain SKILL.md, skipping");
    }
  }
}
