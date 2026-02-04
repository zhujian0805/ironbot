import {
  installSkill,
  listInstalledSkills,
  removeInstalledSkill
} from "./scripts/install_skill.ts";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const listPattern = /\b(?:list|show) (?:installed )?skills\b/i;
const removePattern = /\b(?:remove|uninstall)(?: skill)?\s+(.+)$/i;
const helpPattern = /\b(?:how to use|usage|instructions|help)\b/i;

const SKILL_DOC_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "SKILL.md");
const SKILL_DOC_PROMISE = readFile(SKILL_DOC_PATH, "utf-8");

export const executeSkill = async (input: string): Promise<string> => {
  console.log(`[skill_installer] executeSkill invoked with input: "${input}"`);
  const trimmed = input.trim();
  if (!trimmed) {
    return "Please tell me which skill to install, list, or remove.";
  }

  const lower = trimmed.toLowerCase();
  const hasUrl = /https?:\/\//i.test(input);
  if (helpPattern.test(lower) && !hasUrl) {
    try {
      const doc = await SKILL_DOC_PROMISE;
      return doc;
    } catch {
      return "Refer to the skill_installer SKILL.md for instructions (file missing).";
    }
  }

  if (listPattern.test(lower)) {
    console.log("[skill_installer] Routing to listInstalledSkills");
    return listInstalledSkills();
  }

  const removeMatch = trimmed.match(removePattern);
  if (removeMatch && removeMatch[1]) {
    console.log(`[skill_installer] Routing to removeInstalledSkill for "${removeMatch[1].trim()}"`);
    return removeInstalledSkill(removeMatch[1].trim());
  }

  console.log("[skill_installer] Routing to installSkill");
  return installSkill(input);
};
