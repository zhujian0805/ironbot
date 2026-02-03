## ADDED Requirements

### Requirement: Slack reconnection cooldown gating
The system SHALL track when the Slack socket has been idle for more than 30 seconds and SHALL only allow one reconnection attempt per cooldown window to avoid rapid retries after idle periods.

#### Scenario: Idle socket avoids rapid reconnection
- **WHEN** the Slack connection remains idle for at least 30 seconds and Bolt initiates a new health probe
- **THEN** the agent waits for the cooldown timer instead of immediately sending auth.test and logs the cooldown state

### Requirement: Rate limiter integration for Slack probes
Slack health-check probes (e.g., auth.test, apps.connections.open) SHALL be funneled through the existing RateLimiter/RetryManager, ensuring each request honors the configured wait time before retrying.

#### Scenario: Health check respects rate limit
- **WHEN** multiple slack health probes are queued while the cooldown is active
- **THEN** the rate limiter delays each request until previous cooldowns expire and no 429s return from Slack

### Requirement: Operator-visible cooldown status
While the cooldown is active, the agent SHALL emit WARN-level logs explaining the backoff and update SlackApiOptimizer.getStats() to reflect active cooldown entries so operators can monitor the current state.

#### Scenario: Cooldown logging
- **WHEN** a reconnection attempt is deferred because a cooldown is in effect
- **THEN** the agent logs a WARN message with the cooldown reason and the stats endpoint shows at least one active cooldown count