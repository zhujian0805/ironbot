# Tasks: Tool Permissions Configuration

**Input**: Design documents from `/specs/002-tool-permissions-config/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are MANDATORY - following Test-First principle from constitution.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Paths shown below assume single project structure per plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependency setup

- [x] T001 Add yaml, picomatch, and chokidar to package.json
- [x] T002 [P] Create example permissions.yaml configuration file in project root
- [x] T003 [P] Add PERMISSIONS_FILE environment variable to .env.example

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create permission data models in src/models/permission.ts (PermissionConfig, GlobalSettings, ToolPermissions, ToolRestriction, SkillPermissions, MCPPermissions, MCPSettings, ResourceDenyRule)
- [x] T005 [P] Add PERMISSIONS_FILE config loading to src/config.ts
- [x] T006 [P] Add --permissions-file CLI argument to src/main.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 & 2 - Configure and Enforce Permissions (Priority: P1) 🎯 MVP

**Goal**: Administrators can configure allowed tools/skills/MCPs and the bot strictly enforces those permissions

**Independent Test**: Create a permissions.yaml with specific allowed tools, start bot, verify only those tools work and others are blocked

### Tests for User Story 1 & 2 (MANDATORY) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [P] [US1] Unit test for config loading in tests/unit/test_permission_manager.ts
- [x] T008 [P] [US1] Unit test for YAML parsing and validation in tests/unit/test_permission_manager.ts
- [x] T009 [P] [US2] Unit test for is_tool_allowed() with patterns in tests/unit/test_permission_manager.ts
- [x] T010 [P] [US2] Unit test for is_skill_allowed() in tests/unit/test_permission_manager.ts
- [x] T011 [P] [US2] Unit test for is_mcp_allowed() in tests/unit/test_permission_manager.ts
- [x] T012 [P] [US2] Unit test for resource deny rules in tests/unit/test_permission_manager.ts
- [x] T013 [P] [US2] Contract test for permission enforcement in tests/contract/test_permission_enforcement.ts

### Implementation for User Story 1 & 2

- [x] T014 [US1] Implement PermissionManager.load_config() in src/services/permission_manager.ts
- [x] T015 [US1] Implement YAML parsing with validation in src/services/permission_manager.ts
- [x] T016 [US1] Implement default-deny fallback when no config exists in src/services/permission_manager.ts
- [x] T017 [US2] Implement is_tool_allowed(name) with wildcard pattern matching in src/services/permission_manager.ts
- [x] T018 [US2] Implement is_skill_allowed(name) with wildcard pattern matching in src/services/permission_manager.ts
- [x] T019 [US2] Implement is_mcp_allowed(name) with wildcard pattern matching in src/services/permission_manager.ts
- [x] T020 [US2] Implement check_resource_denied(path) for resource deny rules in src/services/permission_manager.ts
- [x] T021 [US2] Implement get_tool_restrictions(name) for per-tool restrictions in src/services/permission_manager.ts
- [x] T022 [US2] Integrate PermissionManager into ToolExecutor in src/services/tools.ts
- [x] T023 [US2] Filter TOOLS list by permissions in src/services/claude_processor.ts
- [x] T024 [US2] Filter loaded skills by permissions in src/services/skill_loader.ts
- [x] T025 [US2] Add permission denial logging with structured format in src/services/permission_manager.ts

**Checkpoint**: Bot loads config at startup, enforces tool/skill/MCP permissions, blocks denied resources

---

## Phase 4: User Story 3 - Clear Permission Denial Feedback (Priority: P2)

**Goal**: Users receive clear, helpful messages when their requests are denied due to permissions

**Independent Test**: Request a blocked tool, verify user-friendly denial message explains what is not allowed

### Tests for User Story 3 (MANDATORY) ⚠️

- [x] T026 [P] [US3] Unit test for denial message formatting in tests/unit/test_permission_manager.ts
- [x] T027 [P] [US3] Unit test for list_allowed_capabilities() in tests/unit/test_permission_manager.ts

### Implementation for User Story 3

- [x] T028 [US3] Implement format_denial_message(capability_type, name, reason) in src/services/permission_manager.ts
- [x] T029 [US3] Implement list_allowed_capabilities() returning tools/skills/mcps in src/services/permission_manager.ts
- [x] T030 [US3] Update ToolExecutor to return formatted denial messages in src/services/tools.ts
- [x] T031 [US3] Update ClaudeProcessor to include denial messages in responses in src/services/claude_processor.ts

**Checkpoint**: Users see clear messages like "Tool 'run_bash' is not enabled. Allowed tools: list_directory, read_file"

---

## Phase 5: User Story 4 - Hot Reload Without Restart (Priority: P3)

**Goal**: Administrators can update permissions without restarting the bot

**Independent Test**: Modify permissions.yaml while bot is running, verify new permissions take effect within 5 seconds

### Tests for User Story 4 (MANDATORY) ⚠️

- [x] T032 [P] [US4] Unit test for reload_config() in tests/unit/test_permission_manager.ts
- [x] T033 [P] [US4] Integration test for file watcher reload in tests/integration/test_permission_reload.ts

### Implementation for User Story 4

- [x] T034 [US4] Implement reload_config() with atomic config swap in src/services/permission_manager.ts
- [x] T035 [US4] Implement file watcher using chokidar in src/services/permission_manager.ts
- [x] T036 [US4] Add debouncing to prevent multiple reloads during rapid edits in src/services/permission_manager.ts
- [x] T037 [US4] Handle invalid config on reload (keep previous config, log error) in src/services/permission_manager.ts
- [x] T038 [US4] Start file watcher in main.ts startup sequence in src/main.ts

**Checkpoint**: Config changes detected automatically, new permissions effective within 5 seconds

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T039 [P] Update README.md with permissions configuration documentation
- [x] T040 [P] Add permissions section to quickstart guide
- [x] T041 Run all tests and verify 100% of permission checks pass
- [x] T042 Verify structured logging captures all permission denials with audit detail

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories 1 & 2 (Phase 3)**: Depend on Foundational phase completion
- **User Story 3 (Phase 4)**: Can start after Phase 3 (needs PermissionManager)
- **User Story 4 (Phase 5)**: Can start after Phase 3 (needs PermissionManager)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 & 2 (P1)**: Combined as they share PermissionManager - must complete together
- **User Story 3 (P2)**: Can start after US1/US2 - adds feedback layer
- **User Story 4 (P3)**: Can start after US1/US2 - adds hot reload (independent of US3)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models before services
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- T002, T003 can run in parallel (Setup phase)
- T005, T006 can run in parallel (Foundational phase)
- T007-T013 can all run in parallel (US1/US2 tests)
- T026, T027 can run in parallel (US3 tests)
- T032, T033 can run in parallel (US4 tests)
- US3 and US4 can run in parallel after US1/US2 completes

---

## Parallel Example: User Story 1 & 2 Tests

```bash
# Launch all tests for User Story 1 & 2 together:
- [ ] T007 [P] [US1] Unit test for config loading
- [ ] T008 [P] [US1] Unit test for YAML parsing and validation
- [ ] T009 [P] [US2] Unit test for is_tool_allowed()
- [ ] T010 [P] [US2] Unit test for is_skill_allowed()
- [ ] T011 [P] [US2] Unit test for is_mcp_allowed()
- [ ] T012 [P] [US2] Unit test for resource deny rules
- [ ] T013 [P] [US2] Contract test for permission enforcement
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Stories 1 & 2
4. **STOP and VALIDATE**: Verify permissions load and enforce correctly
5. Deploy/demo if ready - bot now respects permission config

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Stories 1 & 2 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 3 → Better user feedback → Deploy/Demo
4. Add User Story 4 → Hot reload capability → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Stories 1 & 2 (core permissions)
   - (After US1/US2 complete):
   - Developer B: User Story 3 (feedback)
   - Developer C: User Story 4 (hot reload)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 are combined because they share the same PermissionManager implementation
- Resource deny rules (FR-012, FR-013) are part of US2 enforcement
- Deny rules take precedence over allow rules
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
