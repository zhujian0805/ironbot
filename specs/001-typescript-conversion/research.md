# Research Findings: Typed Codebase Migration

## Decision: Target runtime and language
- **Decision**: Node.js 20 LTS with TypeScript 5.x
- **Rationale**: LTS runtime stability with modern TypeScript features and long-term support.
- **Alternatives considered**: Node.js 18 LTS; Node.js 22 LTS; Babel-based transpilation without TypeScript.

## Decision: Slack integration (Socket Mode)
- **Decision**: Use Slack Bolt for JavaScript with Socket Mode, ack within 3 seconds, and idempotency for retries.
- **Rationale**: Matches existing Socket Mode behavior while reducing duplicate processing risks and handling Slack retry semantics.
- **Alternatives considered**: Events API over public HTTP; custom WebSocket implementation.

## Decision: Anthropic integration
- **Decision**: Use Anthropic JavaScript SDK with a singleton client, streaming for long responses, and explicit timeout/retry settings.
- **Rationale**: Consistent async behavior, built-in retry policies, and improved responsiveness for long outputs.
- **Alternatives considered**: Raw HTTP client with manual retries; non-streaming requests only.

## Decision: YAML permissions and hot reload
- **Decision**: Parse permissions YAML with `yaml`, validate with a schema (e.g., zod), and hot-reload via `chokidar` with debounce and last-known-good config.
- **Rationale**: Reliable cross-platform file watching and safer config reloads without partial application.
- **Alternatives considered**: `js-yaml`; built-in `fs.watch` without debounce or validation.

## Decision: Test strategy
- **Decision**: Use Vitest for unit/integration/contract tests, add `tsc --noEmit` for typechecks, and use `execa` for CLI behavior tests.
- **Rationale**: Fast TS-first test runner with good ergonomics and clear separation of test layers.
- **Alternatives considered**: Jest with `ts-jest` or `swc/jest`.
