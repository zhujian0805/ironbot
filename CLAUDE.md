# ironbot Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-30

## Active Technologies
- TypeScript 5.x on Node.js 20 LTS + Slack Bolt (Socket Mode), Anthropic JS SDK, YAML parser (`yaml`), file watcher (`chokidar`), CLI arg parser (`commander`), structured logging (`pino`)
- YAML configuration file (`permissions.yaml`)
- Filesystem + environment variables (config YAML, skills directory)
- TypeScript 5.x on Node.js 20 LTS + NSSM (Non-Sucking Service Manager), commander (CLI arg parser), pino (structured logging), execa (process execution) (008-nssm-service)
- File system (configuration files, logs, environment setup) (008-nssm-service)

## Platform Considerations
- On Windows systems, prefer PowerShell over other scripting tools (Python, TypeScript, etc.) when executing system commands or scripts

## Project Structure

```text
src/
tests/
```

## Commands

bun run typecheck; bun run test

## Code Style

TypeScript: Follow existing lint/format configuration

## Recent Changes
- 008-nssm-service: Added TypeScript 5.x on Node.js 20 LTS + NSSM (Non-Sucking Service Manager), commander (CLI arg parser), pino (structured logging), execa (process execution)
- 001-typescript-conversion: Target TypeScript 5.x on Node.js 20 LTS + Slack Bolt (Socket Mode), Anthropic JS SDK, YAML parser (`yaml`), file watcher (`chokidar`), CLI arg parser (`commander`), structured logging (`pino`)
- 002-tool-permissions-config: YAML-based permission system for tools, skills, and MCPs
- improve-slack-thread-context-management: Add thread-aware context management for better anaphora resolution in Slack conversations

## Slack Thread Context Management

### Feature Overview
Ironbot now automatically retrieves and includes Slack thread history when responding to messages within threads. This improves context understanding and allows the bot to resolve pronouns and references without requiring user clarification.

### Configuration
Add the following to your `ironbot.json` configuration file:

```json
{
  "slack": {
    "botToken": "xoxb-...",
    "appToken": "xapp-...",
    "threadContextLimit": 15
  }
}
```

**`threadContextLimit`** (default: 15, optional)
- Maximum number of previous messages to include from a thread for context
- Recommended range: 10-20 messages
- Higher values increase token usage but provide more context
- Lower values reduce token usage but may lose important context

### How It Works
1. When a user sends a message in a Slack thread, ironbot fetches the thread's conversation history from the Slack API
2. Thread history is cached for 5 minutes to avoid redundant API calls
3. The thread context is included in the system prompt as `<slack_thread_context>`
4. Claude uses this context to resolve pronouns and references (e.g., "are they running?" → understands reference to previously mentioned VMs)

### Example
```
Thread conversation:
1. User: "az vm list"
   Bot: "I found 2 VMs: openvpn-Tokyo and moltbot"

2. User: "are they running?"
   Bot: "With thread context, I understand 'they' refers to the VMs from step 1"
```

### Requirements
- Slack bot requires `conversations:history` scope (typically already granted in standard installations)
- Thread history is read-only (no modifications made to threads)
- Context is temporary (not stored, only cached briefly)



<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
