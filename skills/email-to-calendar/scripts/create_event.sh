#!/bin/bash
# Create or update a calendar event
# Usage: create_event.sh <calendar_id> <title> <date> <start_time> <end_time> <description> <attendee_email> [event_id]

CALENDAR_ID="${1:-primary}"
TITLE="$2"
DATE="$3"
START_TIME="$4"
END_TIME="$5"
DESCRIPTION="$6"
ATTENDEE_EMAIL="$7"
EXISTING_EVENT_ID="${8:-}"

if [ -z "$TITLE" ] || [ -z "$DATE" ]; then
    echo "Usage: create_event.sh <calendar_id> <title> <date> <start_time> <end_time> <description> <attendee_email> [event_id]" >&2
    exit 1
fi

# Parse date to ISO format
ISO_DATE=$(python3 -c "
import sys
from datetime import datetime

date_str = '$DATE'
formats = [
    '%B %d, %Y', '%b %d, %Y',
    '%d %B %Y', '%d %b %Y',
    '%m/%d/%Y', '%d/%m/%Y',
    '%Y-%m-%d', '%Y/%m/%d'
]
for fmt in formats:
    try:
        dt = datetime.strptime(date_str.strip(), fmt)
        print(dt.strftime('%Y-%m-%d'))
        sys.exit(0)
    except:
        pass

# Try regex patterns
import re
patterns = [
    (r'(\w+)\s+(\d{1,2}),?\s+(\d{4})', lambda m: (m.group(3), m.group(1), m.group(2))),
]
for pattern, extractor in patterns:
    m = re.search(pattern, date_str, re.I)
    if m:
        year, month, day = extractor(m)
        month_map = {'january':1,'february':2,'march':3,'april':4,'may':5,'june':6,'july':7,'august':8,'september':9,'october':10,'november':11,'december':12,'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,'jul':7,'aug':8,'sep':9,'sept':9,'oct':10,'nov':11,'dec':12}
        month_num = month_map.get(month.lower(), 1)
        print(f'{year}-{month_num:02d}-{int(day):02d}')
        sys.exit(0)

print('')
" 2>/dev/null)

if [ -z "$ISO_DATE" ]; then
    echo "Could not parse date: $DATE" >&2
    exit 1
fi

# Parse times
parse_time() {
    python3 -c "
import re
import sys
time_str = '$1'
if not time_str:
    print('')
    sys.exit(0)

# Patterns: 2:30 PM, 14:30, 9am, etc.
patterns = [
    (r'(\d{1,2}):(\d{2})\s*(am|pm)?', lambda m: (int(m.group(1)), int(m.group(2)), m.group(3))),
    (r'(\d{1,2})\s*(am|pm)', lambda m: (int(m.group(1)), 0, m.group(2))),
]
for pattern, extractor in patterns:
    m = re.search(pattern, time_str, re.I)
    if m:
        hour, minute, ampm = extractor(m)
        if ampm:
            ampm = ampm.lower()
            if ampm == 'pm' and hour != 12:
                hour += 12
            elif ampm == 'am' and hour == 12:
                hour = 0
        print(f'{hour:02d}:{minute:02d}')
        sys.exit(0)
print('')
" 2>/dev/null
}

START_PARSED=$(parse_time "$START_TIME")
END_PARSED=$(parse_time "$END_TIME")

# Default times if not provided
if [ -z "$START_PARSED" ]; then
    START_PARSED="09:00"
fi
if [ -z "$END_PARSED" ]; then
    END_PARSED="17:00"
fi

# Build ISO datetime strings
START_ISO="${ISO_DATE}T${START_PARSED}:00"
END_ISO="${ISO_DATE}T${END_PARSED}:00"

# Check if this is an update or create
if [ -n "$EXISTING_EVENT_ID" ]; then
    # Update existing event
    echo "Updating existing event: $EXISTING_EVENT_ID"
    if [ -n "$ATTENDEE_EMAIL" ]; then
        gog calendar update "$CALENDAR_ID" "$EXISTING_EVENT_ID" \
            --summary "$TITLE" \
            --from "$START_ISO" \
            --to "$END_ISO" \
            --description "$DESCRIPTION" \
            --add-attendee "$ATTENDEE_EMAIL" \
            --send-updates all \
            --json 2>/dev/null
    else
        gog calendar update "$CALENDAR_ID" "$EXISTING_EVENT_ID" \
            --summary "$TITLE" \
            --from "$START_ISO" \
            --to "$END_ISO" \
            --description "$DESCRIPTION" \
            --json 2>/dev/null
    fi
else
    # Create new event with attendee support
    if [ -n "$ATTENDEE_EMAIL" ]; then
        gog calendar create "$CALENDAR_ID" \
            --summary "$TITLE" \
            --from "$START_ISO" \
            --to "$END_ISO" \
            --description "$DESCRIPTION" \
            --attendees "$ATTENDEE_EMAIL" \
            --send-updates all \
            --json 2>/dev/null
    else
        gog calendar create "$CALENDAR_ID" \
            --summary "$TITLE" \
            --from "$START_ISO" \
            --to "$END_ISO" \
            --description "$DESCRIPTION" \
            --json 2>/dev/null
    fi
fi
