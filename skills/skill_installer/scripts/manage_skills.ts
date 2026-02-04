import { installSkill, listInstalledSkills, removeInstalledSkill } from "./install_skill.ts";

async function printUsage() {
  console.log(`
Skill installer helpers:
  node skills/skill_installer/scripts/manage_skills.ts install <url>  -> Install from URL
  node skills/skill_installer/scripts/manage_skills.ts list          -> List installed skills
  node skills/skill_installer/scripts/manage_skills.ts remove <name> -> Remove a skill
`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "install" && rest[0]) {
    console.log(await installSkill(rest.join(" ")));
    return;
  }

  if (command === "list") {
    console.log(await listInstalledSkills());
    return;
  }

  if ((command === "remove" || command === "uninstall") && rest[0]) {
    console.log(await removeInstalledSkill(rest[0]));
    return;
  }

  await printUsage();
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Error running skill installer helper:", error);
    process.exit(1);
  });
}
