---
name: cron-scheduler
description: Schedule Slack reminders via the existing cron store. Use when the user asks the bot to "set up a reminder" or "run something every/at/cron" so you can collect the job name, channel, payload text, and schedule, then invoke `npm run cron -- add …` to write the job into `~/.ironbot/cron/jobs.json`.
---

# Cron Scheduler

## Trigger signals
- The user explicitly says "schedule", "remind", "cron", or "wake" in a Slack thread or DM.
- They ask the bot to send a message at a future time (once or repeating) in a specific channel/thread.
- They describe a schedule (one-off ISO time, duration, `cron` expression, or "every X minutes/hours"), the destination channel, and the reminder text.

## Step-by-step workflow
1. **Gather the required fields.**
   - **Job name** (short descriptive name, e.g., `standup-reminder`). Ask if missing.
   - **Slack channel** (channel ID like `C12345678` or DM `D87654321`). Accept channel names only if you can map to the ID; otherwise prompt for the canonical ID.
   - **Message text** (the reminder to send; trim whitespace).
   - **Schedule** — collect exactly one of:
     - `--at`: ISO timestamp (2025-06-01T09:00:00Z) or human duration (`20m`, `2h`).
     - `--every`: interval like `5m`, `1h`, `1d`.
     - `--cron`: five-field cron expression plus an optional `--tz`.
   - **Optional flags**: timezone (`--tz`), thread ts (`--thread-ts`), delete-after-run (for one-shots), disabled (if they want to save without running), and whether to keep job after run.
   - Confirm whether the job should be enabled immediately.

2. **Build and run the CLI command.**
   - Use the script at `scripts/cron.ts` (invoked via `npm run cron -- add …`).
   - Compose the command with the collected options:
     ```
     npm run cron -- add --name "<name>" --channel "<channel>" --text "<text>" \
       --cron "<expr>" --tz "<tz>"             # for cron jobs
     npm run cron -- add --name "<name>" --channel "<channel>" --text "<text>" \
       --every "10m"                           # for interval jobs
     npm run cron -- add --name "<name>" --channel "<channel>" --text "<text>" \
       --at "2025-03-01T09:00:00Z"
     ```
   - Quote arguments containing spaces. Include `--thread-ts` if the reminder should stay inside a thread.
   - If the user wanted the job disabled initially, add `--disabled`.
   - For one-shot reminders that should disappear after success, add `--delete-after-run`.

3. **Confirm success.**
   - After running the command, read back the cron job summary (ID, next run, status) from the CLI output.
   - Mention that the job is stored in `~/.ironbot/cron/jobs.json` (or whatever `IRONBOT_CRON_STORE_PATH` / `--store` path was used) so the user knows where to look if they want to edit/remove it manually.
   - Suggest `npm run cron -- list` or `npm run cron -- status` to the user if they want to see all scheduled jobs.
   - Report back in Slack that the reminder will fire as scheduled and note the job ID and next run time.

## Edge cases
- If the user does not know the channel ID, ask for the workspace link (`https://app.slack.com/client/T00000000/C12345678`) and extract the `C…`.
- If the user asks for a timezone, validate against IANA names (e.g., `America/Los_Angeles`) when adding `--tz`.
- For duration schedules, confirm they meant repeating (`--every`) rather than one-off (`--at`).
