---
name: email-to-calendar
version: 1.0.0
description: Extract calendar events and action points from forwarded emails, store them for review, and create calendar events with duplicate detection. Use when the user forwards an email containing meeting invites, events, deadlines, or action items, and wants to extract structured items for calendar creation. Also use when the user asks to review previously extracted items or create calendar events from them.
---

# Email to Calendar Skill

Extract calendar events and action items from forwarded emails, present them for review, and create/update calendar events with duplicate detection.

## First-Run Setup

**Before first use, check if configuration exists:**

```bash
CONFIG_FILE="$HOME/.config/email-to-calendar/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Configuration not found. Setup required."
fi
```

**If no config exists, ask the user these questions:**

1. **Gmail Account:** "Which Gmail account should I monitor for forwarded emails?"
2. **Calendar ID:** "Which calendar should events be created in? (default: primary)"
3. **Attendees:** "Should I add attendees to events? If yes, which email addresses? (comma-separated)"
4. **Whole-day Event Style:**
   - "For whole-day events (like school holidays), how should I create them?"
   - Option A: Timed events (e.g., 9 AM - 5 PM)
   - Option B: All-day events (no specific time)
5. **Multi-day Event Style:**
   - "For multi-day events (e.g., Feb 2-6), how should I create them?"
   - Option A: Daily recurring events (one 9-5 event each day)
   - Option B: Single spanning event (one event across all days)
6. **Ignore Patterns (optional):** "Are there event types I should always ignore? (comma-separated, e.g., fundraiser, PTA meeting)"
7. **Auto-create Patterns (optional):** "Are there event types I should always create without asking? (comma-separated, e.g., No School, holiday)"

**Then create the config file:**

```bash
mkdir -p "$HOME/.config/email-to-calendar"
cat > "$CONFIG_FILE" << EOF
{
  "gmail_account": "<USER_GMAIL>",
  "calendar_id": "<CALENDAR_ID>",
  "attendees": {
    "enabled": <true/false>,
    "emails": [<ATTENDEE_EMAILS>]
  },
  "whole_day_events": {
    "style": "<timed/all_day>",
    "start_time": "09:00",
    "end_time": "17:00"
  },
  "multi_day_events": {
    "style": "<daily_recurring/all_day_span>"
  },
  "event_rules": {
    "ignore_patterns": [<IGNORE_PATTERNS>],
    "auto_create_patterns": [<AUTO_CREATE_PATTERNS>]
  }
}
EOF
```

**Read configuration for use:**

```bash
CONFIG_FILE="$HOME/.config/email-to-calendar/config.json"
GMAIL_ACCOUNT=$(jq -r '.gmail_account' "$CONFIG_FILE")
CALENDAR_ID=$(jq -r '.calendar_id' "$CONFIG_FILE")
ATTENDEES_ENABLED=$(jq -r '.attendees.enabled' "$CONFIG_FILE")
ATTENDEE_EMAILS=$(jq -r '.attendees.emails | join(",")' "$CONFIG_FILE")
```

## Reading Email Content

**IMPORTANT:** Before you can extract events, you must read the email body. Use these commands:

### Get a single email by ID (PREFERRED)
```bash
# Read config for Gmail account
CONFIG_FILE="$HOME/.config/email-to-calendar/config.json"
GMAIL_ACCOUNT=$(jq -r '.gmail_account' "$CONFIG_FILE")

gog gmail get <messageId> --account "$GMAIL_ACCOUNT"
```

### Search with body content included
```bash
gog gmail messages search "in:inbox newer_than:1d" --max 5 --include-body --account "$GMAIL_ACCOUNT"
```

### Common Mistakes to Avoid
- WRONG: `gog gmail messages get <id>` - This command does not exist!
- WRONG: Using Python's google-api-python-client - Not installed on this system
- CORRECT: `gog gmail get <id>` - Use this to read a single email

## Workflow

### 1. Detect Forwarded Email

A forwarded email typically has these indicators:
- Subject line starts with "Fwd:", "FW:", or "Forward:"
- Contains forwarded message markers like "---------- Forwarded message ----------" or "Begin forwarded message:"
- Has email headers like "From:", "Date:", "Subject:" within the body
- Contains quoted original message content
- Multiple "On [date] [person] wrote:" patterns

When you detect these patterns, assume the user wants you to process the email for events and actions.

### 2. Read the Full Email Body

First, get the email content using gog:

```bash
# Get email by ID
gog gmail get <messageId> --account "$GMAIL_ACCOUNT"

# Or search with body included
gog gmail messages search "subject:Fwd" --max 5 --include-body --account "$GMAIL_ACCOUNT"
```

### 3. Extract Events and Actions

Parse the email content manually or use the extraction script:

```bash
python3 ~/.openclaw/workspace/skills/email-to-calendar/scripts/extract_events.py <email_content>
```

The script outputs JSON with:
- `events`: Calendar events with title, date, time, and context
- `actions`: Action items and tasks with optional deadlines

### 4. Store Extracted Items

Save the extracted items to a memory file for later review:

```bash
# Create dated extraction file
EXTRACTION_FILE="$HOME/.openclaw/workspace/memory/email-extractions/$(date +%Y-%m-%d-%H%M%S).json"
mkdir -p "$(dirname "$EXTRACTION_FILE")"
python3 ~/.openclaw/workspace/skills/email-to-calendar/scripts/extract_events.py "$EMAIL_CONTENT" > "$EXTRACTION_FILE"
```

Also update a master index file:

```bash
# Update index with new extraction
INDEX_FILE="$HOME/.openclaw/workspace/memory/email-extractions/index.json"
echo '{"extractions": []}' > "$INDEX_FILE" 2>/dev/null || true
python3 << 'EOF'
import json
import sys
import os
from datetime import datetime

index_file = os.path.expanduser("~/.openclaw/workspace/memory/email-extractions/index.json")
extraction_file = os.environ.get('EXTRACTION_FILE', '')
try:
    with open(index_file, 'r') as f:
        index = json.load(f)
except:
    index = {"extractions": []}

index['extractions'].append({
    'file': extraction_file,
    'date': datetime.now().isoformat(),
    'status': 'pending_review'
})

with open(index_file, 'w') as f:
    json.dump(index, f, indent=2)
EOF
```

### 5. Present Items to User

Present the extracted items in a numbered list:

**Events:**
1. **Team Sync** - January 15, 2026 at 2:30 PM
2. **Project Review** - January 16, 2026 (full day)

**Action Items:**
1. **Submit expense report** - Due January 20
2. **Review Q4 metrics** - No deadline specified

Ask: "Which events should I create calendar entries for? Reply with numbers (e.g., '1, 3') or 'all' or 'none'."

### 6. Check for Duplicates

Before creating any event, check for existing duplicates:

```bash
# Check for duplicate
bash ~/.openclaw/workspace/skills/email-to-calendar/scripts/check_duplicate.sh \
    "$CALENDAR_ID" \
    "Event Title" \
    "January 15, 2026" \
    "2:30 PM"
```

The script returns:
- `null` if no duplicate found
- Event JSON if duplicate exists (includes `id` field for updates)

### 7. Create or Update Calendar Events

**IMPORTANT:** Use gog directly with the `--attendees` flag to properly invite attendees.

**Read config for attendees:**
```bash
CONFIG_FILE="$HOME/.config/email-to-calendar/config.json"
ATTENDEES_ENABLED=$(jq -r '.attendees.enabled' "$CONFIG_FILE")
ATTENDEE_EMAILS=$(jq -r '.attendees.emails | join(",")' "$CONFIG_FILE")
CALENDAR_ID=$(jq -r '.calendar_id' "$CONFIG_FILE")
```

#### Creating Single-Day Events

All single-day events should be **9:00 AM to 5:00 PM** (09:00-17:00) by default:

```bash
gog calendar create "$CALENDAR_ID" \
    --summary "Event Title" \
    --from "2026-02-11T09:00:00" \
    --to "2026-02-11T17:00:00" \
    --description "Event description" \
    --attendees "$ATTENDEE_EMAILS" \
    --send-updates all
```

#### Creating Multi-Day Events (e.g., Feb 2-6)

For events spanning multiple days, create a **9:00-17:00 event on the FIRST day** with a recurrence rule for the number of days:

```bash
# Example: Feb 2-6 = 5 days
gog calendar create "$CALENDAR_ID" \
    --summary "Multi-Day Event" \
    --from "2026-02-02T09:00:00" \
    --to "2026-02-02T17:00:00" \
    --description "Event description" \
    --attendees "$ATTENDEE_EMAILS" \
    --send-updates all \
    --rrule "RRULE:FREQ=DAILY;COUNT=5"
```

#### Recurrence Patterns (--rrule flag)

Uses standard RFC 5545 RRULE syntax:

| Pattern | RRULE |
|---------|-------|
| Daily for N days | `RRULE:FREQ=DAILY;COUNT=N` |
| Daily (forever) | `RRULE:FREQ=DAILY` |
| Weekly | `RRULE:FREQ=WEEKLY` |
| Every weekday | `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| Monthly on specific day | `RRULE:FREQ=MONTHLY;BYMONTHDAY=19` |
| Yearly | `RRULE:FREQ=YEARLY` |
| Until a date | `RRULE:FREQ=WEEKLY;UNTIL=20261231T235959Z` |

#### Example: Monthly Meeting with Reminders

```bash
gog calendar create "$CALENDAR_ID" \
    --summary "Monthly Meeting" \
    --from "2026-02-19T19:00:00" \
    --to "2026-02-19T20:00:00" \
    --rrule "RRULE:FREQ=MONTHLY;BYMONTHDAY=19" \
    --reminder "email:1d" \
    --reminder "popup:30m" \
    --attendees "$ATTENDEE_EMAILS" \
    --send-updates all
```

#### Key Flags for Calendar Events

| Flag | Description |
|------|-------------|
| `--attendees` | Comma-separated emails |
| `--send-updates` | `all`, `externalOnly`, or `none` |
| `--rrule` | Recurrence rule (RFC 5545 format) |
| `--reminder` | Add reminder (e.g., `email:1d`, `popup:30m`) |
| `--guests-can-invite` | Allow guests to invite others |
| `--guests-can-modify` | Allow guests to modify event |
| `--guests-can-see-others` | Allow guests to see other attendees |

#### Advanced Attendee Syntax

Mark attendees as optional or add comments:
```bash
--attendees "alice@example.com,bob@example.com;optional,carol@example.com;comment=FYI only"
```

#### Updating Existing Events

```bash
# Replace all attendees
gog calendar update "$CALENDAR_ID" <eventId> --attendees "new@example.com"

# Add attendees while preserving existing ones
gog calendar update "$CALENDAR_ID" <eventId> --add-attendee "additional@example.com"

# Update event details
gog calendar update "$CALENDAR_ID" <eventId> \
    --summary "Updated Title" \
    --from "2026-01-15T09:00:00" \
    --to "2026-01-15T17:00:00"

# Clear recurrence
gog calendar update "$CALENDAR_ID" <eventId> --rrule " "
```

### 8. Handle Cancellations

If the email indicates an event is cancelled:
- Search for the event using `check_duplicate.sh`
- If found, use `gog calendar delete` or update with "CANCELLED" in title

```bash
# Delete/cancel event
gog calendar delete "$CALENDAR_ID" "$EVENT_ID"
```

## Event Creation Rules

### Date/Time Handling

- **Single-day events**: Default 9:00 AM to 5:00 PM (09:00-17:00), configurable
- **Multi-day events** (e.g., Feb 2-6): Create 9:00-17:00 on FIRST day with `--rrule "RRULE:FREQ=DAILY;COUNT=N"` where N = number of days
- **Events with specific times**: Use the exact time from the email
- **No School days / Holidays**: Create as 9:00-17:00 single-day or multi-day as appropriate

### Event Details
- **Subject/Title**: Create descriptive, concise titles (max 80 chars)
- **Description**: Include:
  - Full context from the email
  - Any action items or preparation needed
  - Original sender information
  - Links or attachments mentioned

### Duplicate Detection
Consider it a duplicate if:
- Same date AND
- Similar title (2+ keywords match) AND
- Overlapping time (within 1 hour)

Always update existing events rather than creating duplicates.

### Attendees (if configured)
If `attendees.enabled` is true in config, add configured attendees using:
```bash
--attendees "$ATTENDEE_EMAILS" --send-updates all
```

## Review Pending Items

When the user asks to review previously extracted items:

```bash
# List pending extractions
python3 << 'EOF'
import json
import glob
import os

index_file = os.path.expanduser("~/.openclaw/workspace/memory/email-extractions/index.json")
try:
    with open(index_file, 'r') as f:
        index = json.load(f)
    pending = [e for e in index.get('extractions', []) if e.get('status') == 'pending_review']
    for p in pending:
        print(f"Extraction: {p['file']} ({p['date']})")
        try:
            with open(p['file'], 'r') as ef:
                data = json.load(ef)
                print(f"  Events: {len(data.get('events', []))}")
                print(f"  Actions: {len(data.get('actions', []))}")
        except:
            print("  (could not read)")
except Exception as e:
    print(f"No pending extractions: {e}")
EOF
```

Present the items and ask which to process.

## File Locations

- **Config**: `~/.config/email-to-calendar/config.json`
- **Extractions**: `~/.openclaw/workspace/memory/email-extractions/`
- **Index**: `~/.openclaw/workspace/memory/email-extractions/index.json`
- **Scripts**: `~/.openclaw/workspace/skills/email-to-calendar/scripts/`

## Example Usage

**User forwards email with multi-day event:**
> Fwd: Weekly Update
> ...
> Feb 2-6: Team Offsite
> Feb 11: Valentine's Day Celebrations
> Feb 19: Monthly Meeting 7 PM

**Your response:**
1. Read email body using `gog gmail get <messageId>`
2. Extract items:
   - Event: "Team Offsite" - Feb 2-6 (5 days)
   - Event: "Valentine's Day Celebrations" - Feb 11 (single day)
   - Event: "Monthly Meeting" - Feb 19 at 7 PM
3. Present to user and ask which to create
4. Create events:

```bash
# Read config
CONFIG_FILE="$HOME/.config/email-to-calendar/config.json"
CALENDAR_ID=$(jq -r '.calendar_id' "$CONFIG_FILE")
ATTENDEE_EMAILS=$(jq -r '.attendees.emails | join(",")' "$CONFIG_FILE")

# Multi-day event (Feb 2-6 = 5 days)
gog calendar create "$CALENDAR_ID" \
    --summary "Team Offsite" \
    --from "2026-02-02T09:00:00" \
    --to "2026-02-02T17:00:00" \
    --rrule "RRULE:FREQ=DAILY;COUNT=5" \
    --attendees "$ATTENDEE_EMAILS" \
    --send-updates all

# Single-day event
gog calendar create "$CALENDAR_ID" \
    --summary "Valentine's Day Celebrations" \
    --from "2026-02-11T09:00:00" \
    --to "2026-02-11T17:00:00" \
    --attendees "$ATTENDEE_EMAILS" \
    --send-updates all

# Event with specific time
gog calendar create "$CALENDAR_ID" \
    --summary "Monthly Meeting" \
    --from "2026-02-19T19:00:00" \
    --to "2026-02-19T20:00:00" \
    --attendees "$ATTENDEE_EMAILS" \
    --send-updates all
```

## References

- **Extraction Patterns**: See [references/extraction-patterns.md](references/extraction-patterns.md) for detailed documentation on date/time parsing, event detection, and edge cases.
- **Workflow Example**: See [references/workflow-example.md](references/workflow-example.md) for a complete step-by-step example with sample email and outputs.
- **RRULE Syntax**: https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-recurrence-rule.html

## Notes

### Date Parsing
The extraction script handles most common date formats including:
- January 15, 2026 (with year)
- Wednesday January 15 (without year, defaults to current year)
- 01/15/2026 and 15/01/2026 (numeric formats)
- Relative dates like "next Tuesday" (limited support)
- Date ranges like "Feb 2-6" (extract as multi-day event)

### Time Zones
All times are assumed to be in the local timezone. Time zone information in emails is preserved in descriptions but not used for conversion.
