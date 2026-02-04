import {
  installSkill,
  listInstalledSkills,
  removeInstalledSkill
} from "./scripts/install_skill.ts";

const listPattern = /\b(?:list|show) (?:installed )?skills\b/i;
const removePattern = /\b(?:remove|uninstall)(?: skill)?\s+(.+)$/i;

export const executeSkill = async (input: string): Promise<string> => {
  console.log(`[skill_installer] executeSkill invoked with input: "${input}"`);
  const trimmed = input.trim();
  if (!trimmed) {
    return "Please tell me which skill to install, list, or remove.";
  }

  const lower = trimmed.toLowerCase();
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
