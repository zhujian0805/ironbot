---
name: skill_installer
description: Install, list, or remove skills for IronBot.
metadata:
  openclaw:
    emoji: ⚙️
    triggers: ["install skill", "add skill", "skill installer", "use skill", "new skill", "list skills", "show skills"]
---

# Skill Installer

## Purpose
- Install new skills directly from URLs (GitHub, ClawHub, ZIP files) into IronBot's private skill directory (`~/.ironbot/skills` by default).
- Provide quick references for skills that ship their own `SKILL.md`.
- Offer helper scripts for listing or removing installed skills without touching the workspace copy.

## Using the skill
1. Enable the `skill_installer` skill in `permissions.yaml` if needed.
2. Ask the assistant to `install this skill: https://example.com/skill.zip` or `add https://github.com/owner/skill` – the auto-route keywords above will trigger this skill.
3. The skill downloads, sanitizes the name, extracts ZIPs, ensures a `SKILL.md` exists, and reports status.
4. Once installed, restart the bot or `reload` skills so the new directory is picked up.

### Listing skills
- Say “list skills” or “show installed skills” to get a current inventory of everything this installer manages. The skill uses the same helpers as the CLI and returns a bullet list of directories under IronBot’s private `skills` folder.

### Skill help hints
- When you ask Claude for guidance words like **how**, **guide**, “help me use”, or “usage” alongside a skill name, Claude will automatically include the SKILL.md text for that skill in its response. Try “how do I use skill_installer?” or “show me the SKILL.md for permission_check” and Claude will read the document and tell you exactly what commands or triggers are available without running the installer itself.

## CLI helpers
### `install_skill.ts`
```
node skills/skill_installer/scripts/install_skill.ts install <url>
node skills/skill_installer/scripts/install_skill.ts list
node skills/skill_installer/scripts/install_skill.ts remove <skill-name>
node skills/skill_installer/scripts/install_skill.ts uninstall <skill-name>
```
Use `--install` to download a skill, `list` to show what's under `~/.ironbot/skills`, and `remove` if you need to delete a skill before reinstalling.

### `manage_skills.ts`
```
node skills/skill_installer/scripts/manage_skills.ts install <url>
node skills/skill_installer/scripts/manage_skills.ts list
node skills/skill_installer/scripts/manage_skills.ts remove <skill-name>
node skills/skill_installer/scripts/manage_skills.ts uninstall <skill-name>
```
This wrapper routes to the same helpers and can be a convenient alias if you prefer a dedicated entrypoint.

## Additional commands
- Use “remove <skill-name>” or “uninstall <skill-name>” from a prompt to delete a skill from either the workspace or state directory. The skill will confirm which directory it touched.

## Tips
- The skill always writes into the IronBot state directory (`IRONBOT_STATE_DIR` or `~/.ironbot`), keeping workspace code untouched.
- Installed skills automatically get a minimal `SKILL.md` when one isn't provided.
- `list skills`/`show installed skills` now reports both the state directory (`~/.ironbot/skills`) and the workspace `./skills` tree so you know all available directories.
- Ask “what skills do you have?” to see the new skill after the next restart (or run `Run @permission_check` to view the loaded skill state).

## Trigger reminder
- Saying “list skills” or “show installed skills” automatically triggers the installer’s list action, so you can keep a running inventory of everything under `~/.ironbot/skills` without giving a URL.
