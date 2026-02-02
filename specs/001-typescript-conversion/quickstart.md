# Quickstart: Typed Codebase Migration

> This quickstart describes the intended developer workflow after the TypeScript migration is completed.

## Prerequisites
- Node.js 20 LTS
- Bun

## Configure environment
Set required environment variables:
- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_MODEL` (optional)
- `SKILLS_DIR` (optional, default `./skills`)
- `PERMISSIONS_FILE` (optional, default `./permissions.yaml`)

## Install dependencies
```bash
bun install
# or
npm install
```

Bun is required to run the app and tests because memory indexing uses `bun:sqlite`.

## Run the CLI (development)
```bash
bun run dev -- --permissions-file ./permissions.yaml
```

## Build and run (production)
```bash
bun run build
bun run start -- --permissions-file ./permissions.yaml
```

## Run tests
```bash
bun run test
bun run test:unit
bun run test:integration
bun run test:contract
bun run release-check
```

## Typecheck
```bash
bun run typecheck
```
