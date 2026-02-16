## ADDED Requirements

### Requirement: Configurable agent workspace path
The system SHALL support optional `workspace` field in agent defaults configuration, specifying where agent state and persistent data are stored.

#### Scenario: Workspace path configuration
- **WHEN** agent config specifies `workspace: "/home/azureuser/clawd"`
- **THEN** agent uses that path for all state storage

#### Scenario: Workspace auto-creation
- **WHEN** configured workspace path does not exist
- **THEN** system creates the directory automatically at agent initialization

#### Scenario: Workspace initialization
- **WHEN** agent initializes with workspace path configured
- **THEN** workspace directory exists and is writable before agent starts

### Requirement: State compaction mode configuration
The system SHALL support configurable compaction modes (`safeguard`, `moderate`, `aggressive`) to control how frequently agent state is compacted.

#### Scenario: Safeguard mode (default for production)
- **WHEN** compaction mode is `safeguard`
- **THEN** state is compacted conservatively, prioritizing data safety

#### Scenario: Moderate mode (default for standard deployments)
- **WHEN** compaction mode is `moderate`
- **THEN** state is compacted with balance between storage and CPU usage

#### Scenario: Aggressive mode (for resource-constrained environments)
- **WHEN** compaction mode is `aggressive`
- **THEN** state is compacted frequently, minimizing storage at cost of CPU

### Requirement: Subagent concurrency control
The system SHALL support separate concurrency limit for subagents via `maxConcurrent` field under `subagents` configuration.

#### Scenario: Subagent concurrency limit
- **WHEN** config specifies `subagents.maxConcurrent: 8`
- **THEN** at most 8 subagents can execute concurrently

#### Scenario: Subagent concurrency distinct from main agent
- **WHEN** main agent has `maxConcurrent: 4` and subagents have `maxConcurrent: 8`
- **THEN** limits are enforced independently (4 main + 8 subagents possible simultaneously)

### Requirement: Workspace path resolution
The system SHALL resolve workspace paths supporting tilde (~) expansion and absolute paths.

#### Scenario: Tilde expansion in workspace path
- **WHEN** workspace is configured as `~/.ironbot/workspace`
- **THEN** system expands ~ to user's home directory

#### Scenario: Absolute path support
- **WHEN** workspace is configured as `/var/lib/ironbot/workspace`
- **THEN** system uses absolute path without expansion
