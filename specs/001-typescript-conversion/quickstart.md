# Quickstart: Typed Codebase Migration

> This quickstart describes the intended developer workflow after the TypeScript migration is completed.

## Prerequisites
- Node.js 20 LTS
- npm (or equivalent package manager)

## Configure environment
Set required environment variables:
- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`
- `SLACK_SIGNING_SECRET`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_MODEL` (optional)
- `SKILLS_DIR` (optional, default `./skills`)
- `PERMISSIONS_FILE` (optional, default `./permissions.yaml`)

## Install dependencies
```bash
npm install
```

## Run the CLI (development)
```bash
npm run dev -- --permissions-file ./permissions.yaml
```

## Build and run (production)
```bash
npm run build
node dist/main.js --permissions-file ./permissions.yaml
```

## Run tests
```bash
npm test
npm run test:unit
npm run test:integration
npm run test:contract
npm run release-check
```

## Typecheck
```bash
npm run typecheck
```
