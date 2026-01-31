# Implementation Plan: Typed Codebase Migration

**Branch**: `001-typescript-conversion` | **Date**: 2026-01-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-typescript-conversion/spec.md`

## Summary

Migrate the existing Python CLI Slack agent to a statically typed TypeScript/Node.js codebase while preserving all current behavior, CLI flags, configuration semantics, and integrations. The migration must include functionality introduced in branches `002-tool-permissions-config` and `1-slack-ai-agent`. The plan emphasizes an incremental parity strategy with contract and integration tests, and a library-first structure with a CLI wrapper per constitution requirements.

## Technical Context

**Language/Version**: Current: Python 3.11 → Target: TypeScript 5.x on Node.js 20 LTS
**Primary Dependencies**: Slack Bolt (Socket Mode), Anthropic JS SDK, YAML parser (`yaml`), file watcher (`chokidar`), CLI arg parser (`commander`), structured logging (`pino`)
**Storage**: Filesystem + environment variables (config YAML, skills directory)
**Testing**: Current pytest → Target: Vitest + `tsc --noEmit` + CLI tests via `execa`
**Target Platform**: Cross-platform CLI/service (Windows, Linux, macOS)
**Project Type**: Single CLI service with a core library
**Performance Goals**: Match current baseline behavior and responsiveness for primary workflows
**Constraints**: Preserve existing CLI flags and outputs; maintain Slack Socket Mode behavior; keep permissions hot-reload; include branch features from `002-tool-permissions-config` and `1-slack-ai-agent`
**Scale/Scope**: Single Slack app agent with moderate codebase size and async message handling

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Library-First: Core logic will be extracted into a reusable library module with a thin CLI wrapper.
- CLI Interface: CLI interface will remain the primary entrypoint with text I/O and JSON support where applicable.
- Test-First: Migration tasks will require tests to be written and failing before implementation work begins.
- Integration Testing: Contract and integration tests will validate Slack event handling, permissions reload, and skill execution.
- Observability: Structured logging preserved; CLI and service paths emit debuggable logs.
- Simplicity: Incremental migration with minimal new abstractions.

## Project Structure

### Documentation (this feature)

```text
specs/001-typescript-conversion/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── models/
├── services/
├── utils/
└── cli/

tests/
├── contract/
├── integration/
└── unit/
```

**Structure Decision**: Single-project CLI service. Preserve `src/` and `tests/` layout while introducing a TypeScript build output directory (e.g., `dist/`) as part of the migration tasks.

## Complexity Tracking

No constitution violations identified.

## Constitution Check (Post-Design)

- Library-First: Planned core library + CLI wrapper remains.
- CLI Interface: CLI remains primary interface with text I/O.
- Test-First: Test-first workflow preserved for migration tasks.
- Integration Testing: Contract/integration tests remain required.
- Observability: Structured logging maintained.
- Simplicity: No additional complexity introduced beyond migration needs.
