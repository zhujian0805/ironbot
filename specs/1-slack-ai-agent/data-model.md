# Data Model: Slack AI Agent

## Overview

The Slack AI Agent processes messages from Slack users, forwards them to Claude for AI processing, and supports extensible skills. Data is primarily ephemeral with minimal persistence needs.

## Entities

### Message

Represents a user message received from Slack.

**Fields**:
- `id` (str): Unique identifier for the message (UUID or Slack message ID)
- `content` (str): The text content of the message
- `timestamp` (datetime): When the message was sent (ISO 8601 format)
- `user_id` (str): Slack user ID of the sender
- `channel_id` (str): Slack channel ID where message was sent

**Validation Rules**:
- `content` must not be empty or whitespace-only
- `user_id` and `channel_id` must be valid Slack identifiers
- `timestamp` must be valid datetime

**Relationships**:
- Belongs to User (many-to-one via user_id)

### User

Represents a Slack user interacting with the agent.

**Fields**:
- `id` (str): Slack user ID (unique identifier)
- `name` (str): Display name of the user

**Validation Rules**:
- `id` must be valid Slack user ID format
- `name` must not be empty

**Relationships**:
- Has many Messages (one-to-many via user_id)

### Skill

Represents a Claude Skill that can be loaded and executed.

**Fields**:
- `name` (str): Unique name/identifier for the skill
- `path` (str): File system path to the skill module
- `description` (str): Human-readable description of what the skill does

**Validation Rules**:
- `name` must be unique and contain only alphanumeric characters, underscores, hyphens
- `path` must exist and be a valid Python module file
- `description` must not be empty

**Relationships**:
- Independent entity (no direct relationships)

## Data Flow

1. Message received from Slack → Create Message entity → Lookup/Create User entity
2. Message forwarded to Claude → Response generated
3. Response sent back to Slack channel
4. Skills loaded at startup from directory → Skill entities created

## Storage Considerations

- Messages: Ephemeral (in-memory during processing)
- Users: Cached in-memory with TTL for performance
- Skills: Loaded at startup, cached in-memory

## Schema Evolution

- All entities use simple data structures suitable for JSON serialization
- No database schema required due to ephemeral nature
- Future persistence needs would require adding database layer</content>
<parameter name="file_path">specs/1-slack-ai-agent/data-model.md