# Feature Specification: Tool Permissions Configuration

**Feature Branch**: `002-tool-permissions-config`
**Created**: 2026-01-31
**Status**: Draft
**Input**: User description: "This bot is designed to very strictly run only the allowed tools, skills, MCPs. Design a method to allow user to agree what tools/skills/MCPs to use, you can specify those in a config file"

## Clarifications

### Session 2026-01-31

- Q: Should the system support explicit deny rules for specific resources (e.g., disk paths) beyond just allow-listing tools? → A: Yes, add resource-level deny rules (paths, directories, patterns) that block operations regardless of tool being allowed

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrator Configures Allowed Capabilities (Priority: P1)

As a system administrator, I want to define which tools, skills, and MCPs are allowed for the bot so that I can control what operations the bot can perform on the system.

**Why this priority**: This is the core functionality - without configuration, the permission system cannot function. Administrators need granular control over bot capabilities for security and compliance.

**Independent Test**: Can be fully tested by creating a configuration file with specific permissions and verifying the bot loads and respects those permissions.

**Acceptance Scenarios**:

1. **Given** a configuration file exists with allowed tools listed, **When** the bot starts, **Then** only those tools are available for use.
2. **Given** a configuration file specifies certain skills are disabled, **When** a user requests that skill, **Then** the bot refuses and explains the skill is not permitted.
3. **Given** a configuration file lists allowed MCPs, **When** the bot initializes, **Then** only those MCPs are loaded and available.
4. **Given** no configuration file exists, **When** the bot starts, **Then** the bot operates in a safe default mode with minimal permissions.

---

### User Story 2 - Bot Enforces Permission Boundaries (Priority: P1)

As a system owner, I want the bot to strictly enforce configured permissions so that unauthorized operations cannot be performed regardless of user requests.

**Why this priority**: Security is critical - the bot must reliably prevent unauthorized operations to protect the system.

**Independent Test**: Can be fully tested by attempting to use tools/skills not in the allowed list and verifying they are blocked.

**Acceptance Scenarios**:

1. **Given** a tool is not in the allowed list, **When** Claude attempts to use that tool, **Then** the execution is blocked and an error is returned.
2. **Given** a skill is disabled in configuration, **When** a user message triggers that skill, **Then** the skill does not execute and user is informed.
3. **Given** an MCP is not in the allowed list, **When** the bot processes a request requiring that MCP, **Then** the MCP is not used and appropriate feedback is provided.
4. **Given** a resource path is in the deny list, **When** an allowed tool attempts to access that path, **Then** the operation is blocked regardless of tool permission.

---

### User Story 3 - User Receives Clear Feedback on Permission Denials (Priority: P2)

As a Slack user, I want to understand when my request is denied due to permissions so that I know the bot's limitations and can adjust my requests accordingly.

**Why this priority**: Good user experience requires transparency about what the bot can and cannot do.

**Independent Test**: Can be fully tested by requesting a blocked capability and verifying the feedback message is clear and helpful.

**Acceptance Scenarios**:

1. **Given** a user requests an operation using a blocked tool, **When** the request is denied, **Then** the user receives a message explaining which capability is not allowed.
2. **Given** a user asks what the bot can do, **When** the bot responds, **Then** it can list its currently enabled capabilities.

---

### User Story 4 - Administrator Updates Permissions Without Restart (Priority: P3)

As a system administrator, I want to update permissions without restarting the bot so that I can adjust capabilities with minimal disruption.

**Why this priority**: Operational convenience - reducing downtime for configuration changes improves maintainability.

**Independent Test**: Can be fully tested by modifying the configuration file and verifying new permissions take effect without restart.

**Acceptance Scenarios**:

1. **Given** the bot is running, **When** an administrator modifies the configuration file and triggers a reload, **Then** new permissions take effect immediately.
2. **Given** the configuration is reloaded, **When** previously blocked tools become allowed, **Then** those tools become available for use.

---

### Edge Cases

- What happens when the configuration file is malformed or invalid?
- How does the system handle a configuration that allows zero tools?
- What happens if a tool in the allowed list doesn't exist in the system?
- How are permission conflicts resolved (e.g., tool allowed but dependent MCP blocked)?
- What happens if the configuration file is deleted while the bot is running?
- How are deny rules evaluated when a path matches both an allow pattern and a deny pattern? (Deny takes precedence)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST load tool/skill/MCP permissions from a configuration file at startup.
- **FR-002**: System MUST provide a default safe configuration when no config file exists (deny all tools by default).
- **FR-003**: System MUST validate configuration file format and report errors clearly.
- **FR-004**: System MUST block execution of any tool not explicitly listed in the allowed tools.
- **FR-005**: System MUST block execution of any skill not explicitly listed in the allowed skills.
- **FR-006**: System MUST prevent loading of any MCP not explicitly listed in the allowed MCPs.
- **FR-007**: System MUST log all permission denial events for audit purposes.
- **FR-008**: System MUST provide clear user-facing messages when operations are denied due to permissions.
- **FR-009**: System MUST support configuration reload without requiring a full restart.
- **FR-010**: System MUST validate that allowed tools/skills/MCPs actually exist before enabling them.
- **FR-011**: System MUST support wildcard patterns for allowing groups of capabilities (e.g., "file_*" for all file operations).
- **FR-012**: System MUST support explicit resource-level deny rules that block operations on specific paths, directories, or patterns regardless of whether the tool is allowed.
- **FR-013**: Deny rules MUST take precedence over allow rules (deny overrides allow).

### Key Entities *(include if feature involves data)*

- **PermissionConfig**: The complete permission configuration containing allowed tools, skills, and MCPs, plus global settings like default-deny behavior.
- **Tool Permission**: A permission entry for a specific tool, including the tool name and any restrictions (e.g., allowed arguments, working directories).
- **Skill Permission**: A permission entry for a skill, including the skill name and enabled/disabled status.
- **MCP Permission**: A permission entry for an MCP, including the MCP identifier and connection settings.
- **Resource Deny Rule**: A deny rule for specific resources (file paths, directories, patterns) that blocks operations regardless of tool permissions. Supports wildcards for pattern matching.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of tool executions are validated against the permission configuration before execution.
- **SC-002**: Configuration changes take effect within 5 seconds of reload trigger.
- **SC-003**: Users receive denial feedback within 1 second of attempting a blocked operation.
- **SC-004**: Administrators can configure all permission settings using a single configuration file.
- **SC-005**: System logs all permission denials with sufficient detail for security auditing.
- **SC-006**: Invalid configuration files are rejected with clear error messages identifying the problem.

## Assumptions

- Configuration file format will use a standard, human-readable format (YAML or JSON).
- The bot operates in a "default deny" security model - capabilities must be explicitly allowed.
- The default-deny model is enforced even if configuration attempts to disable it.
- Administrators have filesystem access to modify the configuration file.
- The permission system applies to all users equally (no per-user permissions in this version).
