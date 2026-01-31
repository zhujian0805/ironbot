# Implementation Plan: Tool Permissions Configuration

**Branch**: `002-tool-permissions-config` | **Date**: 2026-01-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-tool-permissions-config/spec.md`

## Summary

Implement a permission configuration system that allows administrators to control which tools, skills, and MCPs the bot can use. The system loads permissions from a YAML configuration file, enforces strict "default deny" security, provides clear user feedback on denials, and supports hot-reload without restart.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS
**Primary Dependencies**: `yaml` (config parsing), `picomatch` (wildcard patterns), `chokidar` (file monitoring for hot-reload)
**Storage**: YAML configuration file (`permissions.yaml`)
**Testing**: bun run test
**Target Platform**: Cross-platform (Linux/Windows server)
**Project Type**: single (extends existing AI agent application)
**Performance Goals**: Permission checks complete in <1ms, config reload <5 seconds
**Constraints**: Zero-downtime config updates, backward compatible with existing tool system
**Scale/Scope**: Support 50+ tools, 20+ skills, 10+ MCPs with wildcard patterns

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Library-First**: Permission system designed as standalone `PermissionManager` class, independently testable
- [x] **CLI Interface**: Will expose `--permissions-file` CLI argument; permission validation via CLI possible
- [x] **Test-First**: Tests will be written before implementation (see tasks.md)
- [x] **Integration Testing**: Contract tests for permission enforcement, integration tests for reload behavior
- [x] **Observability**: All permission denials logged with structured logging; audit trail maintained
- [x] **Simplicity**: Single YAML file configuration; no database required; straightforward allow-list model

## Project Structure

### Documentation (this feature)

```text
specs/002-tool-permissions-config/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── config.ts                    # Add PERMISSIONS_FILE env var
├── main.ts                      # Add --permissions-file CLI arg
├── models/
│   ├── permission_policy.ts     # NEW: Permission data models
│   └── ...
├── services/
│   ├── permission_manager.ts    # NEW: Core permission management
│   ├── tools.ts                 # MODIFY: Integrate permission checks
│   ├── claude_processor.ts      # MODIFY: Filter tools by permissions
│   ├── skill_loader.ts          # MODIFY: Filter skills by permissions
│   └── ...
└── utils/
    └── ...

tests/
├── contract/
│   └── test_permission_enforcement.ts  # NEW: Permission contract tests
├── integration/
│   └── test_permission_reload.ts       # NEW: Hot-reload tests
└── unit/
    └── test_permission_manager.ts      # NEW: Permission manager unit tests
```

**Structure Decision**: Extends existing single-project structure with new permission module. No new top-level directories needed - integrates cleanly with existing `models/` and `services/` layout.

## Complexity Tracking

> No constitution violations - design follows all principles.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A       | N/A        | N/A                                 |
