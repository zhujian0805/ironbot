## 1. Slack connection cooldown

- [x] 1.1 Track socket idle time and enforce a cooldown flag before allowing another reconnection attempt after 30 seconds of inactivity.
- [x] 1.2 Gate all Bolt health probes (auth.test, apps.connections.open) through the RateLimiter/RetryManager so they honor the cooldown wait time.
- [x] 1.3 Surface WARN logs and update SlackApiOptimizer stats whenever the cooldown blocks a probe so operators can monitor the state.

## 2. Verification and cleanup

- [x] 2.1 Add regression tests (unit or integration) that simulate idle Slack connections, confirm cooldown prevents 429 floods, and that logging/metrics reflect the block.
- [x] 2.2 Update relevant documentation or comments to explain the new cooldown behavior for future maintainers.
