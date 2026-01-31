import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { logger } from "../utils/logging.js";
import { getPermissionManager } from "./permission_manager.js";

export type SkillHandler = (input: string) => string | Promise<string>;

export class SkillLoader {
  private skillsDir: string;
  private skills: Record<string, SkillHandler> = {};

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  async loadSkills(): Promise<Record<string, SkillHandler>> {
    logger.debug({ directory: this.skillsDir }, "Loading skills");

    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      const permissionManager = getPermissionManager();

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (entry.name.startsWith("_")) continue;

        const ext = path.extname(entry.name);
        if (!['.js', '.ts', '.mjs', '.cjs'].includes(ext)) continue;

        const skillName = path.basename(entry.name, ext);
        if (permissionManager && !permissionManager.isSkillAllowed(skillName)) {
          logger.info({ skillName }, "Skill blocked by permission config");
          continue;
        }

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

      return this.skills;
    } catch (error) {
      logger.warn({ error, directory: this.skillsDir }, "Skills directory not available");
      return {};
    }
  }
}
