# Email-to-Calendar Setup Guide

This document explains how to configure the email-to-calendar skill for your needs.

## Configuration File

The skill uses a configuration file at `~/.config/email-to-calendar/config.json`.

**On first use, the skill will interactively ask you to configure these settings.**

### Configuration Schema

```json
{
  "gmail_account": "your-email@gmail.com",
  "calendar_id": "primary",
  "attendees": {
    "enabled": true,
    "emails": ["user1@gmail.com", "user2@gmail.com"]
  },
  "whole_day_events": {
    "style": "timed",
    "start_time": "09:00",
    "end_time": "17:00"
  },
  "multi_day_events": {
    "style": "daily_recurring"
  },
  "event_rules": {
    "ignore_patterns": ["fundraiser", "meeting"],
    "auto_create_patterns": ["holiday", "No School"]
  }
}
```

### Configuration Options

| Setting | Type | Description |
|---------|------|-------------|
| `gmail_account` | string | Gmail account to monitor for forwarded emails |
| `calendar_id` | string | Calendar to create events in (use "primary" for main calendar) |
| `attendees.enabled` | boolean | Whether to add attendees to created events |
| `attendees.emails` | string[] | Email addresses to invite as attendees |
| `whole_day_events.style` | "timed" / "all_day" | How to create whole-day events |
| `whole_day_events.start_time` | string | Start time for timed whole-day events (HH:MM) |
| `whole_day_events.end_time` | string | End time for timed whole-day events (HH:MM) |
| `multi_day_events.style` | "daily_recurring" / "all_day_span" | How to handle multi-day events |
| `event_rules.ignore_patterns` | string[] | Event types to always skip |
| `event_rules.auto_create_patterns` | string[] | Event types to create without confirmation |

### Event Style Options

**Whole-day Events:**
- `"timed"`: Creates events with specific times (e.g., 9 AM - 5 PM)
- `"all_day"`: Creates Google Calendar all-day events

**Multi-day Events (e.g., Feb 2-6):**
- `"daily_recurring"`: Creates separate timed events for each day
- `"all_day_span"`: Creates a single event spanning all days

## Example Configurations

### Family Calendar (School Events)

```json
{
  "gmail_account": "family@gmail.com",
  "calendar_id": "primary",
  "attendees": {
    "enabled": true,
    "emails": ["parent1@gmail.com", "parent2@gmail.com"]
  },
  "whole_day_events": {
    "style": "timed",
    "start_time": "09:00",
    "end_time": "17:00"
  },
  "multi_day_events": {
    "style": "daily_recurring"
  },
  "event_rules": {
    "ignore_patterns": ["fundraiser", "PTA meeting", "volunteer request"],
    "auto_create_patterns": ["No School", "holiday", "Staff Development Day"]
  }
}
```

### Work Calendar

```json
{
  "gmail_account": "work@company.com",
  "calendar_id": "primary",
  "attendees": {
    "enabled": false,
    "emails": []
  },
  "whole_day_events": {
    "style": "timed",
    "start_time": "08:00",
    "end_time": "18:00"
  },
  "multi_day_events": {
    "style": "all_day_span"
  },
  "event_rules": {
    "ignore_patterns": ["newsletter", "announcement"],
    "auto_create_patterns": ["deadline", "review"]
  }
}
```

### Personal Calendar (Minimal Config)

```json
{
  "gmail_account": "personal@gmail.com",
  "calendar_id": "primary",
  "attendees": {
    "enabled": false,
    "emails": []
  },
  "whole_day_events": {
    "style": "all_day",
    "start_time": "09:00",
    "end_time": "17:00"
  },
  "multi_day_events": {
    "style": "all_day_span"
  },
  "event_rules": {
    "ignore_patterns": [],
    "auto_create_patterns": []
  }
}
```

## Manual Configuration

If you prefer to create the config manually instead of using the first-run wizard:

```bash
mkdir -p ~/.config/email-to-calendar
cat > ~/.config/email-to-calendar/config.json << 'EOF'
{
  "gmail_account": "your-email@gmail.com",
  "calendar_id": "primary",
  "attendees": {
    "enabled": true,
    "emails": ["attendee@example.com"]
  },
  "whole_day_events": {
    "style": "timed",
    "start_time": "09:00",
    "end_time": "17:00"
  },
  "multi_day_events": {
    "style": "daily_recurring"
  },
  "event_rules": {
    "ignore_patterns": [],
    "auto_create_patterns": []
  }
}
EOF
```

## Prerequisites

This skill requires:
- `gog` CLI tool installed and authenticated with Google OAuth
- `jq` for JSON parsing
- `python3` for event extraction scripts
- `bash` for shell scripts

## Troubleshooting

### Config not found
If you see "Configuration not found. Setup required." - the skill will guide you through interactive setup.

### Events not being created
- Check that `gog` is authenticated: `gog auth status`
- Verify calendar ID is correct: `gog calendar list`
- Check config file permissions: `ls -la ~/.config/email-to-calendar/`

### Wrong calendar
List available calendars: `gog calendar list`
Update `calendar_id` in config to use a specific calendar ID.
