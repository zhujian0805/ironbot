# ironbot Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-30

## Active Technologies
- TypeScript 5.x on Node.js 20 LTS + Slack Bolt (Socket Mode), Anthropic JS SDK, YAML parser (`yaml`), file watcher (`chokidar`), CLI arg parser (`commander`), structured logging (`pino`)
- YAML configuration file (`permissions.yaml`)
- Filesystem + environment variables (config YAML, skills directory)

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
- 001-typescript-conversion: Target TypeScript 5.x on Node.js 20 LTS + Slack Bolt (Socket Mode), Anthropic JS SDK, YAML parser (`yaml`), file watcher (`chokidar`), CLI arg parser (`commander`), structured logging (`pino`)
- 002-tool-permissions-config: YAML-based permission system for tools, skills, and MCPs

- 1-slack-ai-agent: Slack AI agent built with Slack Bolt and Anthropic JS SDK

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
