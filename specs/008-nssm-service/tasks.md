# Tasks: Windows Service Wrapper using NSSM

**Input**: Design documents from `/specs/008-nssm-service/`
**Prerequisites**: plan.md (tech stack, structure), spec.md (user stories P1-P2), data-model.md (configuration models), contracts/cli-api.openapi.json, research.md (technical decisions)

**Tests**: MANDATORY - Test-First principle requires all tests written and failing before implementation

**Organization**: Tasks grouped by user story (US1-US4) to enable independent implementation and testing of each story

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project structure**: `src/`, `tests/` at repository root
- Paths below follow plan.md structure for windows-service module

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and windows-service module structure

- [x] T001 Create windows-service module directory structure: `src/services/windows-service/{commands,config,utils}`
- [x] T002 [P] Create service module exports in `src/services/windows-service/index.ts`
- [x] T003 [P] Create TypeScript interfaces file `src/services/windows-service/types/index.ts` with ServiceConfig, ServiceStatus, InstallOptions, ValidationResult types
- [x] T004 Create test directories: `tests/unit/windows-service/` and `tests/integration/windows-service/`
- [x] T005 Update `src/main.ts` to include windows-service CLI command registration
- [x] T006 [P] Create CLI entry point `src/cli/windows-service-cli.ts` with commander setup for install, uninstall, status, logs commands

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure MUST be complete before ANY user story can begin

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Implement NSSM command wrapper in `src/services/windows-service/config/nssm.ts`:
  - executeNssmCommand(command: string, args: string[]): Promise<CommandResult>
  - parseNssmStatus(output: string): ServiceStatus
  - Support all NSSM operations (install, uninstall, status, get, set, remove)
- [x] T008 Implement path utilities in `src/services/windows-service/utils/paths.ts`:
  - resolveProjectPath(): string (get absolute path to IronBot project folder)
  - validatePathAccessibility(path: string): Promise<boolean>
  - getLogPath(projectPath: string): string
- [x] T009 [P] Implement environment variable handling in `src/services/windows-service/utils/env.ts`:
  - validateEnvironmentVariables(requiredVars: string[]): Promise<ValidationResult>
  - getEnvironmentFromUser(username: string): Promise<Record<string, string>>
- [x] T010 [P] Implement process execution wrapper in `src/services/windows-service/utils/process.ts`:
  - executeCommand(command: string, args: string[], options: ExecOptions): Promise<ExecResult>
  - executeWithCredentials(command: string, username: string, password: string): Promise<ExecResult>
- [x] T011 Implement service configuration builder in `src/services/windows-service/config/service-config.ts`:
  - buildServiceConfig(options: ServiceConfigOptions): Promise<ServiceConfig>
  - validateServiceConfig(config: ServiceConfig): ValidationResult
  - Pre-installation validation checks: admin privileges, NSSM available, user account exists, path accessible, service name unique, credentials valid

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Install IronBot as Windows Service (Priority: P1) 🎯 MVP

**Goal**: Operators can install IronBot as a Windows service with automatic startup on boot

**Independent Test**: Can be fully tested by installing service, rebooting, and verifying IronBot is running post-reboot

### Tests for User Story 1 (MANDATORY - Test-First)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T012 [P] [US1] Write unit tests for install command validation in `tests/unit/windows-service/install-validation.test.ts`:
  - Test pre-installation checks (admin, NSSM, user account, path, service name, credentials)
  - Test validation error handling and messaging
- [x] T013 [P] [US1] Write integration test for service installation in `tests/integration/windows-service/install.test.ts`:
  - Setup: Create test service name
  - Test: Execute install command with valid configuration
  - Verify: Service appears in Windows Services (via nssm status)
  - Verify: Service has correct NSSM configuration (nssm dump)
  - Cleanup: Uninstall test service
- [x] T014 [US1] Write integration test for auto-start on boot in `tests/integration/windows-service/install-boot.test.ts`:
  - Test: Verify startup type is set to 'auto'
  - Test: Verify AppRestartDelay is configured (3 seconds)
  - Verify: Service configuration persists across restarts (query via NSSM)

### Implementation for User Story 1 ✓

- [x] T015 [P] [US1] Implement install command in `src/services/windows-service/commands/install.ts`:
  - parseInstallOptions(cliArgs): InstallOptions
  - promptForPassword(username: string): Promise<string> (masked input)
  - configureServiceWithNssm(config: ServiceConfig): Promise<CommandResult>
  - Support options: --service-name, --startup-type, --auto-restart, --force, --username, --skip-validation
  - Output formats: human-readable and JSON
- [x] T016 [US1] Implement NSSM service registration (completed in Phase 2 T007):
  - installService(config: ServiceConfig): Promise<boolean>
  - setServiceAppDirectory(serviceName: string, path: string): Promise<boolean>
  - setServiceLogging(serviceName: string, logPath: string): Promise<boolean>
  - setServiceUser(serviceName: string, username: string, password: string): Promise<boolean>
  - setServiceStartup(serviceName: string, type: 'auto'|'manual'): Promise<boolean>
  - setServiceAutoRestart(serviceName: string, delaySeconds: number): Promise<boolean>
- [x] T017 [US1] Implement credential storage in `src/services/windows-service/config/service-config.ts`:
  - storeCredentialsInWindowsCredentialManager(username: string, password: string): Promise<boolean>
  - retrieveCredentialsFromWindowsCredentialManager(username: string): Promise<string|null>
  - Use target name format: `ironbot-service:{username}`
- [x] T018 [US1] Implement error handling and validation messaging in install command:
  - Clear error messages for: missing admin, NSSM not found, user not found, path invalid, service exists, credentials invalid
  - Return appropriate exit codes: 0 (success), 1 (general error), 2 (admin), 3 (NSSM), 4 (user), 5 (service exists), 6 (path)
  - Ensure all output to stdout/stderr with proper formatting

**Checkpoint**: User Story 1 is fully functional and independently testable

---

## Phase 4: User Story 2 - Service Runs with Correct User Context (Priority: P1)

**Goal**: Service runs under jzhu user account with access to environment variables and files

**Independent Test**: Can be fully tested by verifying process runs under jzhu user and can access environment variables from user profile

### Tests for User Story 2 (MANDATORY - Test-First)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T019 [P] [US2] Write integration test for user context verification in `tests/integration/windows-service/user-context.test.ts`:
  - Setup: Install service with jzhu user
  - Test: Query service process via Windows API (Get-Process or wmic)
  - Verify: Process runs under jzhu user account (domain\username format)
  - Verify: Process has access to jzhu user's environment variables
- [x] T020 [P] [US2] Write integration test for environment variable access in `tests/integration/windows-service/env-variables.test.ts`:
  - Setup: Install service with critical env vars in jzhu profile (SLACK_BOT_TOKEN, ANTHROPIC_API_KEY simulation)
  - Test: IronBot service can access these variables (via logging or test output)
  - Verify: Variables from user's HKEY_CURRENT_USER\Environment accessible to service

### Implementation for User Story 2

- [x] T021 [US2] Implement user account validation in `src/services/windows-service/config/service-config.ts`:
  - validateUserAccountExists(username: string): Promise<boolean>
  - getUserAccountInfo(username: string): Promise<{domain: string, username: string}>
  - Format user credential: `{DOMAIN}\{username}` or `.{username}` for local accounts
- [x] T022 [US2] Implement credential manager integration in `src/services/windows-service/config/nssm.ts`:
  - storeAndApplyCredentials(serviceName: string, username: string, password: string): Promise<boolean>
  - setServiceObjectName(serviceName: string, username: string, password: string): Promise<boolean>
  - Use NSSM command: `nssm set {serviceName} ObjectName {domain}\{username} {password}`
- [x] T023 [US2] Implement environment variable validation in `src/services/windows-service/config/service-config.ts`:
  - validateEnvironmentVariableAccess(username: string, requiredVars: string[]): Promise<ValidationResult>
  - Check: HKEY_CURRENT_USER\Environment for user's registry hive
  - Report: Missing critical variables (SLACK_BOT_TOKEN, ANTHROPIC_API_KEY) as warnings
- [x] T024 [US2] Implement service user context verification in install command:
  - Add pre-installation check: Verify user account exists and has required environment variables
  - Display: Which environment variables will be accessible to service
  - Add warning messages for missing variables with suggestion to configure

**Checkpoint**: User Stories 1 AND 2 work independently - service runs under correct user with environment access

---

## Phase 5: User Story 3 - Service Uses Project Directory as Working Directory (Priority: P1)

**Goal**: Service executes with project folder as working directory for correct file resolution

**Independent Test**: Can be fully tested by verifying service uses project folder as working directory and loads configuration files correctly

### Tests for User Story 3 (MANDATORY - Test-First)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T025 [P] [US3] Write integration test for working directory configuration in `tests/integration/windows-service/working-directory.test.ts`:
  - Setup: Install service with absolute project path
  - Test: Query NSSM AppDirectory setting
  - Verify: AppDirectory equals absolute project path (nssm get {service} AppDirectory)
  - Verify: Path is absolute, not relative
- [x] T026 [P] [US3] Write integration test for configuration file resolution in `tests/integration/windows-service/config-resolution.test.ts`:
  - Setup: Create test permissions.yaml in project folder
  - Test: Service can load permissions.yaml using relative path
  - Verify: IronBot can access configuration without path errors
  - Verify: Logs are written to project directory location

### Implementation for User Story 3

- [x] T027 [US3] Implement project path resolution in `src/services/windows-service/utils/paths.ts`:
  - resolveAbsoluteProjectPath(inputPath?: string): Promise<string>
  - Validate path exists and is accessible
  - Return absolute path (handle relative paths, symlinks, env vars)
  - resolveConfigFilePath(projectPath: string, filename: string): string
- [x] T028 [US3] Implement working directory configuration in `src/services/windows-service/config/nssm.ts`:
  - setServiceWorkingDirectory(serviceName: string, workingDirectory: string): Promise<boolean>
  - Use NSSM command: `nssm set {serviceName} AppDirectory {absolutePath}`
  - Validate path accessibility before applying
- [x] T029 [US3] Implement log directory setup in `src/services/windows-service/config/service-config.ts`:
  - createLogDirectory(projectPath: string): Promise<boolean>
  - setServiceLogPath(serviceName: string, projectPath: string): Promise<boolean>
  - Log path: `{projectPath}\logs\service.log`
  - Create logs directory if not exists
- [x] T030 [US3] Implement working directory validation in install command:
  - Pre-installation check: Verify project path is accessible
  - Display: Absolute project path being used as working directory
  - Verify: Key config files exist (permissions.yaml, etc.)
  - Add warning if required directories not found

**Checkpoint**: User Stories 1, 2, AND 3 work independently - service has correct working directory and configuration access

---

## Phase 6: User Story 4 - Service Management Operations (Priority: P2)

**Goal**: Operators can start, stop, check status, and view logs

**Independent Test**: Can be fully tested by executing service control commands and verifying state changes

### Tests for User Story 4 (MANDATORY - Test-First)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T031 [P] [US4] Write integration test for service status in `tests/integration/windows-service/status.test.ts`:
  - Setup: Install and start service
  - Test: Execute status command
  - Verify: Returns 'running' state, process ID, uptime
  - Verify: Output format matches ServiceStatus interface
- [ ] T032 [P] [US4] Write integration test for service stop/start in `tests/integration/windows-service/lifecycle.test.ts`:
  - Test: Execute stop command (net stop, nssm stop)
  - Verify: Service transitions to 'stopped' state within timeout
  - Test: Execute start command (net start, nssm start)
  - Verify: Service transitions to 'running' state
- [ ] T033 [P] [US4] Write integration test for service logs in `tests/integration/windows-service/logs.test.ts`:
  - Setup: Install service and generate log entries
  - Test: Execute logs command with --lines 50
  - Verify: Returns log entries from service.log
  - Test: Execute logs with --follow
  - Verify: Streams new log entries as they arrive

### Implementation for User Story 4

- [ ] T034 [P] [US4] Implement status command in `src/services/windows-service/commands/status.ts`:
  - getServiceStatus(serviceName: string): Promise<ServiceStatus>
  - parseNssmStatus(): ServiceStatus (from NSSM output)
  - queryWindowsServiceState(serviceName: string): Promise<ServiceState>
  - Support options: --json, --watch
  - Output: Human-readable or JSON format
  - Handle case: Service not found, NSSM error
- [ ] T035 [P] [US4] Implement service lifecycle commands in `src/services/windows-service/config/nssm.ts`:
  - startService(serviceName: string): Promise<boolean>
  - stopService(serviceName: string, timeoutSeconds: number = 30): Promise<boolean>
  - restartService(serviceName: string): Promise<boolean>
  - Use: net start/stop commands or NSSM commands
  - Handle: Service already running/stopped, timeout, permission errors
- [ ] T036 [US4] Implement logs command in `src/services/windows-service/commands/logs.ts`:
  - readServiceLogs(logPath: string, lines: number = 50): Promise<LogEntry[]>
  - parseLogEntries(logContent: string): LogEntry[] (parse NSSM log format)
  - followServiceLogs(logPath: string): AsyncIterable<LogEntry> (tail -f behavior)
  - filterLogsByLevel(entries: LogEntry[], level: string): LogEntry[]
  - filterLogsByTimestamp(entries: LogEntry[], since: string): LogEntry[]
  - Support options: --lines, --follow, --since, --level, --json
- [ ] T037 [US4] Implement uninstall command in `src/services/windows-service/commands/uninstall.ts`:
  - validateServiceCanBeUninstalled(serviceName: string): Promise<boolean>
  - stopServiceIfRunning(serviceName: string): Promise<void> (with --force flag)
  - uninstallService(serviceName: string): Promise<boolean>
  - Use NSSM command: `nssm remove {serviceName} confirm`
  - Support options: --force (skip confirmation), --json
  - Handle: Service running, NSSM error, permission errors
- [ ] T038 [US4] Add error handling to all management commands:
  - Exit codes: 0 (success), 1 (general error), 2 (admin required), 3 (service not found)
  - Clear error messages for: service not found, timeout, permission denied, NSSM error
  - Log all operations with timestamps and outcomes

**Checkpoint**: All user stories 1-4 are complete and independently testable

---

## Phase 7: CLI Integration & Polish

**Purpose**: Improvements and cross-cutting concerns affecting all stories

- [ ] T039 Integrate all commands into CLI in `src/cli/windows-service-cli.ts`:
  - Register install, uninstall, status, logs commands with commander
  - Implement common options: --json, --help for all commands
  - Add help text and examples for each command
- [ ] T040 [P] Implement error handling and logging throughout service module:
  - Use pino logger for structured logging of all operations
  - Add debug logs for NSSM command execution
  - Add info logs for successful operations
  - Add error logs with stack traces for failures
- [ ] T041 [P] Add input validation and sanitization:
  - Validate service names, usernames, paths
  - Prevent command injection in NSSM commands
  - Validate exit codes and handle unexpected NSSM behavior
- [ ] T042 Update `src/main.ts` to properly integrate windows-service CLI:
  - Add windows-service command group to main CLI
  - Register all subcommands: install, uninstall, status, logs
  - Test CLI help: `ironbot-service --help`, `ironbot-service install --help`, etc.
- [ ] T043 [P] Add comprehensive documentation:
  - Update quickstart.md with CLI examples for all commands
  - Add troubleshooting guide entries in quickstart.md
  - Document command exit codes and error messages
  - Add examples for JSON output format
- [ ] T044 Run all tests to verify complete feature:
  - Execute unit tests: `bun test tests/unit/windows-service/`
  - Execute integration tests: `bun test tests/integration/windows-service/`
  - Verify all tests pass
  - Verify test coverage >80% for service module
- [ ] T045 Validate against quickstart.md test scenarios:
  - Follow developer quickstart (quickstart.md)
  - Verify installation workflow end-to-end
  - Verify service management operations
  - Verify logs and status commands work correctly
- [ ] T046 [P] Code cleanup and refactoring:
  - Remove any debug code or console.log statements
  - Extract common patterns into utilities
  - Ensure consistent error handling across all commands
  - Ensure consistent output formatting (JSON and human-readable)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - **BLOCKS all user stories**
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - All user stories can proceed in parallel (if team capacity allows)
  - Or sequentially in priority order: P1 (US1→US2→US3) → P2 (US4)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (Install Service)**: No dependencies on other stories - can implement immediately after Foundational
- **User Story 2 (User Context)**: No dependencies on other stories - can implement in parallel with US1
- **User Story 3 (Working Directory)**: No dependencies on other stories - can implement in parallel with US1/US2
- **User Story 4 (Management Operations)**: All previous stories can be used but should work independently

### Within Each User Story

- Tests MUST be written first and FAIL before implementation (Test-First principle)
- Unit tests can run in parallel with integration tests (marked [P])
- Implementation tasks follow logical order: utils → config → commands

### Parallel Opportunities

**Phase 1 Setup**: All [P] marked tasks can run in parallel:
- T002, T003, T004, T006 (directory setup, types, test dirs, CLI entry)

**Phase 2 Foundational**: All [P] marked tasks can run in parallel:
- T009, T010 (env handling, process wrapper)
- But T007, T008, T011 must complete before user stories start (critical path)

**Phase 3-6 User Stories**: Each story's tests can run in parallel:
- T012 & T013 & T014 can run together (US1 tests)
- T019 & T020 can run together (US2 tests)
- T025 & T026 can run together (US3 tests)
- T031 & T032 & T033 can run together (US4 tests)

**Parallel by Team**: With multiple developers:
1. One developer completes Phase 1 Setup
2. One developer completes Phase 2 Foundational (CRITICAL PATH)
3. Once Phase 2 done:
   - Developer A: Phase 3 (US1)
   - Developer B: Phase 4 (US2)
   - Developer C: Phase 5 (US3)
   - All working in parallel on different files

---

## Parallel Example: User Story 1 (Install Service)

```bash
# First, run all tests in parallel (they should all FAIL initially):
Task: T012 - Unit tests for install validation
Task: T013 - Integration test for service installation
Task: T014 - Integration test for auto-start on boot

# Once tests written, run all utilities in parallel:
Task: T015 - Implement install command
Task: T016 - Implement NSSM service registration
Task: T017 - Implement credential storage
Task: T018 - Implement error handling and validation

# Run tests again - they should now PASS
```

---

## Implementation Strategy

### MVP First (User Story 1 Only) - Recommended Start

**Goals**: Get basic service installation working quickly for validation

1. **Complete Setup (Phase 1)**: ~1-2 hours
   - Create directory structure and module organization

2. **Complete Foundational (Phase 2)**: ~3-4 hours
   - NSSM wrapper, path utils, environment handling (critical blocking)

3. **Complete User Story 1 (Phase 3)**: ~4-5 hours
   - Write tests first (T012-T014)
   - Implement install command and NSSM integration (T015-T018)
   - Tests should PASS

4. **STOP and VALIDATE**:
   - Test User Story 1 independently: `ironbot-service install --help`
   - Verify service installs successfully
   - Verify service appears in Windows Services
   - Demo to stakeholders if needed

**At this point, you have working MVP: operators can install IronBot as a Windows service**

### Incremental Delivery (All User Stories)

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 (Install) → Test independently → DONE (MVP!)
3. Add User Story 2 (User Context) → Test independently → DONE
4. Add User Story 3 (Working Directory) → Test independently → DONE
5. Add User Story 4 (Management Operations) → Test independently → DONE
6. Polish & Cross-Cutting Concerns → All stories enhanced

Each story adds value without breaking previous stories.

### Parallel Team Strategy (Multiple Developers)

**Timeline**: ~6-8 hours total with proper parallelization

1. **Hour 1**: Team completes Setup + Foundational together
2. **Hours 2-6**: Once Foundational done (CRITICAL), teams split:
   - Team A: User Story 1 (Install Service)
   - Team B: User Story 2 (User Context)
   - Team C: User Story 3 (Working Directory)
   - Working in PARALLEL on different files
3. **Hour 7**: Integrate all stories (should just work - no conflicts)
4. **Hour 8**: Polish & testing

---

## Testing Strategy

### Test Organization

- **Unit Tests**: Component-level, no external dependencies
  - Tests in: `tests/unit/windows-service/`
  - Focus: NSSM wrapper, path resolution, environment validation, config building
  - Run fast: ~1-2 seconds

- **Integration Tests**: Feature-level, requires Windows environment
  - Tests in: `tests/integration/windows-service/`
  - Focus: Service installation, user context, working directory, lifecycle
  - Requires: Admin privileges, NSSM installed, Windows OS
  - Run: ~30-60 seconds per test (service operations are slow)

### Test Execution

```bash
# Run all unit tests (fast, no external dependencies)
bun test tests/unit/windows-service/

# Run all integration tests (slower, requires Windows setup)
bun test tests/integration/windows-service/

# Run tests for specific user story
bun test tests/**/*install*.test.ts        # US1 tests
bun test tests/**/*user-context*.test.ts   # US2 tests
bun test tests/**/*working-directory*.test.ts # US3 tests
bun test tests/**/*lifecycle*.test.ts      # US4 tests

# Run with coverage
bun test --coverage tests/unit/windows-service/
```

---

## Notes

- **[P] marker**: Tasks with [P] work on different files and have no interdependencies - can be run in parallel
- **[Story] label**: Maps task to specific user story (US1-US4) for traceability
- Each user story is independently completable and testable
- **CRITICAL**: Tests MUST be written and FAIL before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- Constitution requires: Test-First (mandatory), Observability (structured logging), Simplicity (no over-engineering)

---

## Success Criteria

All 7 success criteria from feature spec must be met:

- [ ] SC-001: IronBot service installs successfully and appears in Windows Services management console (US1)
- [ ] SC-002: Service starts automatically on Windows system boot without manual intervention (US1)
- [ ] SC-003: Service runs under the jzhu user account as verified by process properties or Task Manager (US2)
- [ ] SC-004: IronBot successfully accesses environment variables from the jzhu user's profile (US2)
- [ ] SC-005: Service uses the project folder as working directory, enabling correct file resolution for configuration files (US3)
- [ ] SC-006: Service can be stopped and restarted using standard Windows service commands (US4)
- [ ] SC-007: All operator workflows (start, stop, status check, view logs) complete successfully (US4)
