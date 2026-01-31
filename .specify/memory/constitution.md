<!-- Sync Impact Report
Version change: new constitution v1.0.0
Modified principles: none (new)
Added sections: all principles, Additional Constraints, Development Workflow
Removed sections: none
Templates requiring updates: .specify/templates/plan-template.md ✅ updated, .specify/templates/tasks-template.md ✅ updated, .specify/templates/spec-template.md ✅ aligned, README.md ✅ updated
Follow-up TODOs: none
-->
# ironbot Constitution

## Core Principles

### I. Library-First
Every feature starts as a standalone library; Libraries must be self-contained, independently testable, documented; Clear purpose required - no organizational-only libraries

### II. CLI Interface
Every library exposes functionality via CLI; Text in/out protocol: stdin/args → stdout, errors → stderr; Support JSON + human-readable formats

### III. Test-First (NON-NEGOTIABLE)
TDD mandatory: Tests written → User approved → Tests fail → Then implement; Red-Green-Refactor cycle strictly enforced

### IV. Integration Testing
Focus areas requiring integration tests: New library contract tests, Contract changes, Inter-service communication, Shared schemas

### V. Observability, Versioning & Breaking Changes, Simplicity
Text I/O ensures debuggability; Structured logging required; MAJOR.MINOR.BUILD format; Start simple, YAGNI principles

## Additional Constraints

Technology stack requirements, compliance standards, deployment policies, etc.

## Development Workflow

Code review requirements, testing gates, deployment approval process, etc.

## Governance

All PRs/reviews must verify compliance; Complexity must be justified; Use constitution.md for runtime development guidance

**Version**: 1.0.0 | **Ratified**: 2026-01-30 | **Last Amended**: 2026-01-30
