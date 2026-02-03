## Context

Slack socket mode connections can sit idle for many minutes when the agent is not in use, and our current startup/health probes immediately hit Slack APIs (e.g., auth.test). When the idle socket reawakens, these probes sometimes fire multiple requests in rapid succession, triggering Slack 429s and leaving the bot unresponsive until the SDK recovers. The proposal introduces the slack-rate-limit-resilience capability so the agent backs off before reusing those APIs.

## Goals / Non-Goals

**Goals:**
- Detect when the Slack connection has been idle and gate reconnection attempts behind a cooldown that remembers the last successful auth result.
- Reuse the existing rate limiter and retry manager to throttle auth.test/health checks until Slack signals readiness.
- Surface status to operators so we log when the bot is waiting for the cooldown instead of hammering Slack.

**Non-Goals:**
- Reimplement Slack socket handling; rely on Bolt's socket manager and avoid replacing the core connection logic.
- Add new third-party rate-limit caches or distributed coordination; keep changes local to this agent instance.

## Decisions

1. **Use an idle timer + cooldown flag in the SlackMessageHandler/optimizer**
   - Rationale: handlers already know channel/thread context and can intercept reconnection attempts, so we can prevent auth.test from firing until the cooldown expires.
   - Alternative avoided: rewriting the main event loop; keeping logic scoped to the handler limits blast radius.

2. **Leverage the existing RateLimiter/RetryManager to gate Slack probes**
   - Rationale: these classes already encapsulate wait-time reporting and logging, so reusing them ensures consistent behavior in other rate-limited paths.
   - Alternative: Add a new ad-hoc debounce; rejected because it duplicates functionality and would duplicate logging.

3. **Record a timestamp of the last successful Slack API call and allow one warm-up check per minute**
   - Rationale: ensures we eventually reconnect without permanent delay but still limit rapid retries.
   - Alternative: track per-event cooldown; too complex compared to a simple global timer for idle periods.

## Risks / Trade-offs

- [Risk] Bolt socket reconnection might still fire before we can update the cooldown state ¡ú [Mitigation] ensure cooldown state is initialized before any health-check/auth.test is scheduled and guard those calls with the limiter.
- [Risk] Operators may not notice the bot is pausing due to cooldown ¡ú [Mitigation] log explicit WARN-level messages when the cooldown is active and include metrics via SlackApiOptimizer.getStats().

## Migration Plan

1. Deploy with the new handler logic but leave cooldown thresholds conservative (e.g., 30s) and monitor logs for active cooldown warnings.
2. Gradually reduce the throttle window if Slack 429s stop occurring.
3. Roll back by reverting the handler changes if Slack 429s persist or new outages appear.

## Open Questions

- Should we expose a configuration knob for the cooldown duration, or keep it hardcoded for now?
- Does the health-check path need to skip Bolt-level auth.test entirely once the cooldown is active, or simply delay until the limiter expires?