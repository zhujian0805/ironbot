# ironbot Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-30

## Active Technologies
- Python 3.11 (consistent with existing codebase) + PyYAML (config parsing), fnmatch (wildcard patterns), watchdog (file monitoring for hot-reload) (002-tool-permissions-config)
- YAML configuration file (`permissions.yaml`) (002-tool-permissions-config)

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
- 002-tool-permissions-config: Added Python 3.11 (consistent with existing codebase) + PyYAML (config parsing), fnmatch (wildcard patterns), watchdog (file monitoring for hot-reload)

- 1-slack-ai-agent: Added Python 3.11 + slack-sdk, anthropic, asyncio

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
