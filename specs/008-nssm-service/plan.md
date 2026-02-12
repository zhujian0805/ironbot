# Implementation Plan: Windows Service Wrapper using NSSM

**Branch**: `008-nssm-service` | **Date**: 2026-02-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-nssm-service/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Create a Windows service wrapper for IronBot using NSSM (Non-Sucking Service Manager) that enables the application to run as a managed Windows service under the jzhu user account with the project folder as working directory. The wrapper will provide CLI tools for installation, uninstallation, and service management while ensuring the application automatically starts on system boot and has access to user environment variables.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS
**Primary Dependencies**: NSSM (Non-Sucking Service Manager), commander (CLI arg parser), pino (structured logging), execa (process execution)
**Storage**: File system (configuration files, logs, environment setup)
**Testing**: bun test (unit + integration tests)
**Target Platform**: Windows (service context, no interactive input)
**Project Type**: CLI tool (single command-line application)
**Performance Goals**: Fast installation/uninstallation (<5 seconds), reliable service startup (<10 seconds), graceful shutdown (<30 seconds)
**Constraints**: Must run in Windows service context without interactive prompts; NSSM must be pre-installed; jzhu user account must exist; project folder must be accessible
**Scale/Scope**: Single service instance per IronBot installation; supports standard Windows service lifecycle operations

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

✓ **Library-First**: Service wrapper will be designed as a standalone CLI library (`@ironbot/service-wrapper`) that can be tested and deployed independently
✓ **CLI Interface**: Primary interface is CLI with text I/O: `ironbot-service install|uninstall|status|logs` with JSON and human-readable output support
✓ **Test-First**: Integration tests required for service installation/uninstallation, user context verification, working directory validation, environment variable access
✓ **Integration Testing**: Tests must verify interaction between CLI, NSSM wrapper, Windows service subsystem, and IronBot application
✓ **Observability**: Structured logging via pino; service status and logs accessible via CLI; all operations logged with timestamps and outcomes
✓ **Simplicity**: Minimal wrapper around NSSM; no custom service management, no additional abstractions beyond required CLI interface

**Gate Status**: ✓ PASS - All principles can be satisfied. No complexity violations.

## Project Structure

### Documentation (this feature)

```text
specs/008-nssm-service/
├── plan.md              # This file (implementation plan)
├── research.md          # Phase 0 output (research findings and decisions)
├── data-model.md        # Phase 1 output (service configuration model, contracts)
├── quickstart.md        # Phase 1 output (developer onboarding guide)
├── contracts/           # Phase 1 output (API/CLI contract definitions)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── services/
│   └── windows-service/
│       ├── commands/
│       │   ├── install.ts      # NSSM service installation
│       │   ├── uninstall.ts     # Service removal
│       │   ├── status.ts        # Service status query
│       │   └── logs.ts          # Log viewing
│       ├── config/
│       │   ├── service-config.ts # Service configuration builder
│       │   └── nssm.ts          # NSSM interaction helpers
│       ├── utils/
│       │   ├── paths.ts         # Project path utilities
│       │   ├── env.ts           # Environment variable handling
│       │   └── process.ts       # Process execution wrappers
│       └── index.ts             # Library exports
├── cli/
│   └── windows-service-cli.ts   # CLI entry point (commander setup)
└── main.ts                       # Updated to include service wrapper commands

tests/
├── integration/
│   ├── windows-service-install.test.ts    # Service installation tests
│   ├── windows-service-uninstall.test.ts  # Service removal tests
│   ├── windows-service-user-context.test.ts # User/environment tests
│   └── windows-service-lifecycle.test.ts  # Start/stop/status tests
└── unit/
    ├── nssm.test.ts            # NSSM utility tests
    ├── service-config.test.ts   # Configuration builder tests
    └── paths.test.ts           # Path utility tests
```

**Structure Decision**: Single project structure with a new `windows-service` service module under `src/services/`. The CLI is extended with new service management commands. Tests are organized by integration (feature-level workflows) and unit (component-level logic). This follows the existing project layout and constitution principles.

## Complexity Tracking

No constitution violations. Design adheres to all core principles:
- Single project structure (Library-First)
- CLI interface with text I/O (CLI Interface)
- Integration tests for service workflows (Integration Testing)
- Minimal abstraction around NSSM (Simplicity)

---

## Phase 0: Research Complete ✓

**Output**: `research.md` - Comprehensive technical research covering:
- NSSM integration and Windows service management best practices
- User context and credential storage using Windows Credential Manager
- Working directory configuration and path resolution
- Environment variable inheritance from user profile
- CLI command structure and operator workflows
- Logging and observability strategy
- Service startup, lifecycle, and auto-restart behavior
- Validation and error handling procedures
- Security considerations and deployment checklist

**Key Decisions**:
- Use NSSM with spawn mode for reliable service wrapper
- Store credentials in Windows Credential Manager (DPAPI encryption)
- Set absolute project path as working directory at install time
- Auto-inherit environment variables from jzhu user profile
- Implement 4 core CLI commands: install, uninstall, status, logs
- NSSM handles stdout/stderr logging to file
- 3-second delay between auto-restart attempts
- 30-second grace period for graceful shutdown

---

## Phase 1: Design Complete ✓

### Data Model (`data-model.md`)
Defines:
- **ServiceConfig**: Core configuration model with all service parameters
- **ServiceStatus**: Current state of Windows service with uptime and process info
- **Installation Options**: CLI parameters for install command
- **Validation Result**: Pre-installation check output format
- **CLI Command Contracts**: Detailed specs for install, uninstall, status, logs commands with:
  - Command signatures and parameters
  - Exit codes and their meanings
  - Output formats (human-readable and JSON)
  - State transitions and error scenarios
  - Configuration persistence in Registry and Credential Manager
  - Validation rules for pre-installation and runtime

### API Contracts (`contracts/cli-api.openapi.json`)
OpenAPI 3.0 specification for CLI interface:
- `POST /install`: Service installation with options
- `DELETE /uninstall`: Service removal with safety checks
- `GET /status`: Service status querying with watch support
- `GET /logs`: Service log retrieval with filtering
- Component schemas for request/response types
- Exit codes and error handling

### Developer Quickstart (`quickstart.md`)
Provides:
- Development prerequisites (Windows, Node.js 20, NSSM, admin access)
- Project structure reference
- NSSM command reference and wrapper usage
- Configuration builder usage
- Testing guide (unit and integration tests)
- CLI development workflow
- Common development tasks and debugging
- Troubleshooting guide
- References to external documentation

---

## Constitution Re-Check ✓

All core principles verified in Phase 1 design:

✓ **Library-First**: Service wrapper is standalone `@ironbot/service-wrapper` library
✓ **CLI Interface**: Text I/O via commander.js with JSON + human-readable output
✓ **Test-First**: Integration tests defined for service installation, user context, working directory, lifecycle
✓ **Integration Testing**: Tests verify service registration, NSSM interaction, Windows Services subsystem integration
✓ **Observability**: Structured logging via pino; service status and logs queryable via CLI
✓ **Simplicity**: Minimal wrapper around NSSM; no custom service management logic

**Gate Status**: ✓ PASS - Design adheres to all constitution principles
