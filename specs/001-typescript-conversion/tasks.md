# Tasks: Typed Codebase Migration

**Input**: Design documents from `/specs/001-typescript-conversion/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are MANDATORY - always include test tasks as per Test-First principle.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Initialize Node/TypeScript project metadata and dependencies in package.json
- [x] T002 Add TypeScript build configs in tsconfig.json and tsconfig.build.json
- [x] T003 [P] Add Vitest configuration in vitest.config.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement environment/config loader in src/config.ts
- [x] T005 [P] Implement structured logging utility in src/utils/logging.ts
- [x] T006 [P] Implement file watch helper for hot reload in src/utils/file_watcher.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Preserve Current Behavior (Priority: P1) 🎯 MVP

**Goal**: Preserve all existing workflows, CLI flags, outputs, and integrations in the TypeScript migration.

**Independent Test**: Run primary workflows and compare outputs to baseline; all tests pass with no regressions.

### Tests for User Story 1 (MANDATORY) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [P] [US1] Add CLI flag parity tests in tests/cli/cli_flags.test.ts
- [x] T008 [P] [US1] Add Slack message flow integration test in tests/integration/message_flow.test.ts
- [x] T009 [P] [US1] Add permission hot-reload contract test in tests/contract/permission_reload.test.ts
- [x] T010 [P] [US1] Add tool permission enforcement unit tests in tests/unit/permission_manager.test.ts

### Implementation for User Story 1

- [x] T011 [P] [US1] Create workflow model in src/models/workflow.ts
- [x] T012 [P] [US1] Create permission policy model in src/models/permission_policy.ts
- [x] T013 [P] [US1] Create tool request model in src/models/tool_request.ts
- [x] T014 [P] [US1] Create skill definition model in src/models/skill_definition.ts
- [x] T015 [P] [US1] Create Slack event model in src/models/slack_event.ts
- [x] T016 [P] [US1] Create Claude request model in src/models/claude_request.ts
- [x] T017 [P] [US1] Create Claude response model in src/models/claude_response.ts
- [x] T018 [US1] Implement permissions manager with YAML parsing + hot reload in src/services/permission_manager.ts (depends on T004, T006, T012)
- [x] T019 [US1] Implement tool registry and permission guard in src/services/tools.ts (depends on T013, T018)
- [x] T020 [US1] Implement skill loader with permission filtering in src/services/skill_loader.ts (depends on T014, T018)
- [x] T021 [US1] Implement Slack Socket Mode handler in src/services/slack_handler.ts (depends on T004, T005)
- [x] T022 [US1] Implement Claude processor in src/services/claude_processor.ts (depends on T016, T017)
- [x] T023 [US1] Implement message routing/workflow orchestration in src/services/message_router.ts (depends on T019, T020, T021, T022)
- [x] T024 [US1] Implement CLI entrypoint and wiring in src/main.ts (depends on T021, T023)
- [x] T025 [US1] Port 002-tool-permissions-config behaviors into src/services/permission_manager.ts and src/services/tools.ts
- [x] T026 [US1] Port 1-slack-ai-agent behaviors into src/services/slack_handler.ts and src/services/claude_processor.ts

**Checkpoint**: User Story 1 functional and testable independently

---

## Phase 4: User Story 2 - Earlier Detection of Data Compatibility Issues (Priority: P2)

**Goal**: Detect incompatible data expectations before release using schema validation and release checks.

**Independent Test**: Introduce a deliberate incompatibility and confirm release checks fail before deployment.

### Tests for User Story 2 (MANDATORY) ⚠️

- [x] T027 [P] [US2] Add schema validation unit tests in tests/unit/validation.test.ts
- [x] T028 [P] [US2] Add release-check integration test in tests/integration/release_check.test.ts

### Implementation for User Story 2

- [x] T029 [US2] Add data expectation schemas in src/validation/permission_policy.ts and src/validation/tool_request.ts
- [x] T030 [US2] Wire validation into src/services/permission_manager.ts and src/services/tools.ts (depends on T029)
- [x] T031 [US2] Add release-check CLI command in src/cli/check_release.ts and npm script in package.json

**Checkpoint**: User Stories 1 and 2 both independently testable

---

## Phase 5: User Story 3 - Updated Contributor Workflow (Priority: P3)

**Goal**: Provide updated contributor instructions for running, testing, and modifying the project.

**Independent Test**: A contributor can build and run the system using the updated instructions from a clean checkout.

### Tests for User Story 3 (MANDATORY) ⚠️

- [x] T032 [P] [US3] Add contributor workflow smoke test in tests/integration/quickstart.test.ts

### Implementation for User Story 3

- [x] T033 [US3] Update TypeScript setup, run, test, and CLI usage docs in README.md

**Checkpoint**: All user stories independently functional and documented

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story alignment and validation

- [x] T034 [P] Reconcile quickstart instructions in specs/001-typescript-conversion/quickstart.md with package.json scripts and README.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - Can proceed in parallel if staffed, or sequentially P1 → P2 → P3
- **Polish (Phase 6)**: Depends on completion of desired user stories

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - no dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - validates compatibility of US1 components
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - documentation depends on final CLI behavior

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models before services
- Services before orchestration/CLI wiring
- Story complete before moving to next priority

### Parallel Opportunities

- Phase 1: T003 can run in parallel with T001/T002 once package.json exists
- Phase 2: T005 and T006 can run in parallel
- US1: Model tasks (T011–T017) can run in parallel
- US1: Test tasks (T007–T010) can run in parallel
- US2: Test tasks (T027–T028) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together:
Task: "Add CLI flag parity tests in tests/cli/cli_flags.test.ts"
Task: "Add Slack message flow integration test in tests/integration/message_flow.test.ts"
Task: "Add permission hot-reload contract test in tests/contract/permission_reload.test.ts"
Task: "Add tool permission enforcement unit tests in tests/unit/permission_manager.test.ts"

# Launch all US1 models together:
Task: "Create workflow model in src/models/workflow.ts"
Task: "Create permission policy model in src/models/permission_policy.ts"
Task: "Create tool request model in src/models/tool_request.ts"
Task: "Create skill definition model in src/models/skill_definition.ts"
Task: "Create Slack event model in src/models/slack_event.ts"
Task: "Create Claude request model in src/models/claude_request.ts"
Task: "Create Claude response model in src/models/claude_response.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate User Story 1 independently with its tests

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. Add User Story 1 → test independently → MVP
3. Add User Story 2 → test independently
4. Add User Story 3 → test independently
5. Polish phase to align docs and quickstart

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Avoid cross-story dependencies that break independence
