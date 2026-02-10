---
name: cron-scheduler
description: Schedule Slack reminders via the existing cron store. Use when the user asks the bot to "set up a reminder" or "run something every/at/cron" so you can collect the job name, channel, payload text, and schedule, then invoke `npm run cron -- add …` to write the job into `~/.ironbot/cron/jobs.json`. Jobs are self-contained and do not retain original conversation context.
---

# Cron Scheduler

## Purpose
This skill creates **internal cron jobs only**. It never creates Windows scheduled tasks or uses any external scheduler. All jobs are stored in `~/.ironbot/cron/jobs.json` and managed by the internal cron system. Jobs are self-contained and **do not retain original conversation context** - each job must be complete with all necessary information encoded within the job itself.

## Trigger signals
- The user explicitly says "schedule", "remind", "cron", or "wake" in a Slack thread or DM.
- They ask the bot to send a message at a future time (once or repeating) in a specific channel/thread.
- They describe a schedule and can provide (or are willing to provide) a `cron` expression for it.

## Step-by-step workflow
1. **Gather the required fields.**
   - **Job name** (short descriptive name, e.g., `standup-reminder`). Ask if missing.
   - **Slack channel** (channel ID like `C12345678` or DM `D87654321`). Accept channel names only if you can map to the ID; otherwise prompt for the canonical ID.
   - **Message text** (the reminder to send; trim whitespace).
   - **Schedule** — collect:
     - `--cron`: five-field cron expression plus an optional `--tz`.
   - **Optional flags**: timezone (`--tz`), thread ts (`--thread-ts`), delete-after-run (for one-shots), disabled (if they want to save without running), and whether to keep job after run.
   - Confirm whether the job should be enabled immediately.
   - **Important**: Ensure all context is embedded in the job itself - the scheduled job must be self-contained and not rely on external context or conversation history.

2. **Build and run the CLI command.**
   - Use the script at `scripts/cron.ts` (invoked via `npm run cron -- add …`).
   - Compose the command with the collected options:
     ```
     npm run cron -- add --name "<name>" --channel "<channel>" --text "<text>" \
       --cron "<expr>" --tz "<tz>"
     ```
   - Quote arguments containing spaces. Include `--thread-ts` if the reminder should stay inside a thread.
   - If the user wanted the job disabled initially, add `--disabled`.
   - For one-shot reminders that should disappear after success, add `--delete-after-run`.

3. **Confirm success.**
   - After running the command, read back the cron job summary (ID, next run, status) from the CLI output.
   - Mention that the job is stored in `~/.ironbot/cron/jobs.json` (or whatever `IRONBOT_CRON_STORE_PATH` / `--store` path was used) so the user knows where to look if they want to edit/remove it manually.
   - Suggest `npm run cron -- list` or `npm run cron -- status` to the user if they want to see all scheduled jobs.
   - Report back in Slack that the reminder will fire as scheduled and note the job ID and next run time.
   - **Remind the user that the job is self-contained and will execute without retaining original conversation context.**

## Important Implementation Detail
**Always create internal cron jobs using the `npm run cron -- add` command. Never create Windows scheduled tasks or use any external scheduler. All jobs must be stored in the internal cron system at `~/.ironbot/cron/jobs.json`. Jobs are self-contained and do not retain original conversation context - they must contain all necessary information within the job definition itself.**

## Direct Execution for Scripts (Windows Priority: PowerShell First)
For jobs that need to execute scripts directly, **prefer PowerShell over TypeScript and Python** on Windows systems:

**PowerShell scripts**: Use the `--tool` parameter with run_powershell
```
npm run cron -- add --name "powershell-job" --tool run_powershell --tool-param "command=C:/full/path/to/script.ps1" --at "2025-03-01T09:00:00Z"
```

**TypeScript scripts**: Use the `--tool` parameter with run_bash to execute with tsx
```
npm run cron -- add --name "typescript-job" --tool run_bash --tool-param "command=npx tsx C:/full/path/to/script.ts" --at "2025-03-01T09:00:00Z"
```

**When running scripts, always specify the full path** to ensure reliable execution:
- Use absolute paths like `C:/full/path/to/script.ps1` instead of relative paths like `./script.ps1` or `../script.ps1`
- Always use forward slashes `/` instead of backslashes `\` in paths for cross-platform compatibility
- Always include the complete file extension (`.ps1`, `.ts`, etc.)
- Verify paths are absolute before scheduling to prevent execution failures
- **CRITICAL**: Never use relative paths (e.g., `./script.ts`, `../scripts/job.py`) as they will fail when the cron job executes

**Python scripts**: Use the `--tool` parameter with run_bash
```
npm run cron -- add --name "python-job" --tool run_bash --tool-param "command=python3 /full/path/to/script.py" --at "2025-03-01T09:00:00Z"
```

## Edge cases
- If the user does not know the channel ID, ask for the workspace link (`https://app.slack.com/client/T00000000/C12345678`) and extract the `C…`.
- If the user asks for a timezone, validate against IANA names (e.g., `America/Los_Angeles`) when adding `--tz`.
- If the user gives a natural-language time or interval, ask them for the equivalent five-field cron expression (and `--tz` if needed).
- For jobs involving external tools or scripts, ensure all context and parameters are fully contained within the job definition rather than relying on external state or context.
- For scripts, **always validate that absolute paths are used** instead of relative paths to ensure successful execution.
