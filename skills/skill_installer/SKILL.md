---
name: skill_installer
description: Install, list, or remove skills for IronBot via natural language statements and helper scripts.
metadata:
  openclaw:
    emoji: ⚙️
    triggers: ["install skill", "add skill", "skill installer", "use skill", "new skill", "list skills", "show skills", "remove skill", "uninstall skill", "skill help"]
---

# Skill Installer

## Purpose
- Install new skills directly from URLs (GitHub repos/tree views, ZIP bundles, ClawHub APIs) into the IronBot skill catalog (`~/.ironbot/skills` or whatever `IRONBOT_STATE_DIR` is set to).
- Provide tooling to list every skill that lives under both the IronBot state directory and the workspace `./skills` folder so you can audit what the bot sees right now.
- Remove or uninstall skills from either location without touching workspace source files and report which directory was modified.

## How to trigger this skill from a prompt
1. Ask the bot: `Run @skill_installer install skill - https://github.com/owner/repo/tree/main/skills/cool` or `install this skill: https://example.com/skill.zip`. The skill parses the first URL it finds and treats GitHub tree URLs specially, copying only the skill subdirectory (`memory`, `skill_name`, etc.).
2. Say “list skills”, “show installed skills”, or even “what skills are available?” to get a bullet list of everything under `~/.ironbot/skills` and `./skills`. The installer now highlights whether each skill directory is blocked or allowed.
3. Remove a skill by saying “remove skill <name>”, “uninstall <name>”, or “delete <name> skill”. The installer tries the state directory first, then the workspace directory, logging and reporting which location was affected.
4. Request help with phrases like “how do I use skill_installer?”, “guide me on the skill installer”, or “help skill_installer”. When Claude sees these keywords together with the skill name, it will echo this exact document so you always get the latest guidance.

## Cool features
- Names extracted from URLs are sanitized (no `..`, no slashes, limited length) before a directory is created, keeping the skill catalog tidy.
- GitHub tree URLs are handled by cloning the repo, copying just the referenced `skills/...` folder, and deleting the temporary clone so only the intended skill folder lands in `~/.ironbot/skills`.
- ZIP blobs are extracted with `Expand-Archive` and automatically receive a minimal `SKILL.md` if none exists.
- `console.log` statements are emitted for list/remove/install actions so you can trace invocation details in the running logs.

## CLI helper script
The same helpers power a CLI entry point at `skills/skill_installer/scripts/install_skill.ts`. Use it when you want predictable, repeatable behavior from a shell.

```
node skills/skill_installer/scripts/install_skill.ts install <url>   # Download and install a skill
node skills/skill_installer/scripts/install_skill.ts list            # List skills in ~/.ironbot/skills and ./skills
node skills/skill_installer/scripts/install_skill.ts remove <name>  # Delete a skill directory
```

## Tips
- The skill always writes into the IronBot state directory (`IRONBOT_STATE_DIR` or `~/.ironbot`). Workspace directories remain untouched unless you explicitly uninstall a skill from `./skills`.
- After installing a skill, run “list skills” or “Run @permission_check” to confirm it is visible and permitted.
- When you need documentation for another skill, ask something like “show me the SKILL.md for permission_check” and the assistant will read the file for you.
