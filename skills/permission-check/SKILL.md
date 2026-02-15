---
name: permission_check
description: Show the current permission configuration, blocked commands, and loaded skill status.
metadata:
  openclaw:
    emoji: 🛡️
    triggers: ["permission check", "what skills", "access", "can I"]
---

# Permission Check

## Purpose
- Summarize which tools and skills are currently permitted by the running permission manager.
- Report global blocked commands and key restrictions (PowerShell, blocked cmdlets, etc.).
- List every skill the bot can or cannot load so you can spot blocked or missing helpers.

## How to Run
1. Send a prompt such as `Run @permission_check` or ask "what skills do you have?".
2. You can also say "check my permissions" or "what can I run"—the skill auto-routes based on the triggers above.
3. The skill runs without invoking external tools; it only reads the permission manager and filesystem state.

## Output Highlights
- **Available Skills:** Shows each skill/skill directory plus a blocked notice when applicable.
- **Allowed Tools:** Lists every tool the permission manager currently permits (e.g., `run_powershell`).
- **Allowed Skills:** Lists skill names that are explicitly permitted by the configuration.
- **Key Restrictions:** Provides PowerShell command white/black lists and the first few globally blocked commands.

Use this skill whenever you suspect a permission denial or want a quick view of what the bot can currently do.
