# ironbot Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-30

## Active Technologies
- Python 3.11 (consistent with existing codebase) + PyYAML (config parsing), fnmatch (wildcard patterns), watchdog (file monitoring for hot-reload) (002-tool-permissions-config)
- YAML configuration file (`permissions.yaml`) (002-tool-permissions-config)
- Current: Python 3.11 → Target: TypeScript 5.x on Node.js 20 LTS + Slack Bolt (Socket Mode), Anthropic JS SDK, YAML parser (`yaml`), file watcher (`chokidar`), CLI arg parser (`commander`), structured logging (`pino`) (001-typescript-conversion)
- Filesystem + environment variables (config YAML, skills directory) (001-typescript-conversion)

- Python 3.11 + slack-sdk, anthropic, asyncio (1-slack-ai-agent)

## Project Structure

```text
src/
tests/
```

## Commands

cd src; pytest; ruff check .

## Code Style

Python 3.11: Follow standard conventions

## Recent Changes
- 001-typescript-conversion: Added Current: Python 3.11 → Target: TypeScript 5.x on Node.js 20 LTS + Slack Bolt (Socket Mode), Anthropic JS SDK, YAML parser (`yaml`), file watcher (`chokidar`), CLI arg parser (`commander`), structured logging (`pino`)
- 002-tool-permissions-config: Added Python 3.11 (consistent with existing codebase) + PyYAML (config parsing), fnmatch (wildcard patterns), watchdog (file monitoring for hot-reload)

- 1-slack-ai-agent: Added Python 3.11 + slack-sdk, anthropic, asyncio

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
