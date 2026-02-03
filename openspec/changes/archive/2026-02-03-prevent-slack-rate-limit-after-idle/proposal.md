## Why

Slack sockets stay idle for long periods between user requests. When they eventually try to reconnect, the agent floods auth.test and other Slack API calls, triggers a 429 rate limit, and then stalls until the connection is reset, leaving the user hanging. This change prevents that regression so the bot can recover from idle periods without exhausting Slack.

## What Changes

- Detect when the Slack connection has been idle and avoid aggressive retries by gating reconnection attempts behind a cooldown.
- Throttle outgoing Slack API calls (especially auth.test and health checks) after idle windows using the existing rate limiter and a brief exponential backoff.
- Update Slack initialization (main.ts, Slack handler/optimizer) so we only poll Slack when the socket is ready and can tell users we are waiting for rate limits to clear.

## Capabilities

### New Capabilities
- slack-rate-limit-resilience: Ensures the agent backs off and de-duplicates Slack reconnection attempts after extended idle periods so it does not hit API rate limits and can still respond to new messages.

### Modified Capabilities
- <existing-name>: <what requirement is changing>

## Impact

- src/main.ts and any background health checks that call Slack APIs
- SlackMessageHandler/SlackApiOptimizer and the rate limiter where cooldown logic must integrate with queued requests
- Tests covering rate limiting and reconnection behavior to prove we no longer trigger Slack 429s after idle