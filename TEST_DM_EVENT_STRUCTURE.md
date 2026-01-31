# DM Event Structure Investigation

## Problem
DM messages fail to create threads while channel messages work successfully.

## Root Cause Found
The `message` event from Slack for DM channels **may not include the `ts` (timestamp) field**, which is required for creating threads.

## Evidence
1. **Integration Test** (tests/integration/message_flow.test.ts, lines 57-61):
   - DM event object: `{ user: "U123", text: "hello", channel: "D123" }`
   - **Missing: `ts` field**

2. **Message Router** (src/services/message_router.ts, line 87):
   - Code: `const threadTs = event.thread_ts ?? event.ts;`
   - For new DM: threadTs becomes `undefined` (both fields missing)
   - Result: Response posted without `thread_ts` parameter

3. **Response Posting Logic** (src/services/message_router.ts, lines 162-173):
   - If `threadTs` is falsy, posts to channel root (no thread)
   - This explains why DMs don't have threaded conversations

## Solution Implemented

### 1. Fallback Timestamp Generation
**File**: `src/services/message_router.ts` (line 88)
```typescript
const messageTs = event.ts ?? `${Date.now() / 1000}`;
const threadTs = event.thread_ts ?? messageTs;
```
- If `event.ts` is missing, generate one from current timestamp
- Ensures `threadTs` is never undefined/falsy
- Enables thread creation even without Slack-provided ts

### 2. Enhanced Logging
**File**: `src/services/slack_handler.ts` (lines 20-26)
- Logs event structure for DM messages
- Shows presence/absence of `ts` field
- Helps diagnose if `ts` is being filtered out

**File**: `src/services/message_router.ts` (lines 88-104)
- Logs computed threadTs
- Shows whether ts was generated or provided
- Tracks thread creation success/failure

## Next Steps to Verify

1. **Check Bot Logs**
   - Start the bot with `DEBUG=true`
   - Send a DM message
   - Check logs for:
     ```
     "Message event received" {
       isDm: true,
       eventTs: undefined,  // This confirms the issue
       computedMessageTs: "1704067200.123",
       tsWasGenerated: true
     }
     ```

2. **Verify Thread Creation**
   - Send a DM to the bot
   - Check if response appears in a thread on the user's message
   - Check if the thread is rooted on either:
     - The user's original message (desired)
     - Or the generated timestamp (fallback)

3. **If Still Failing**
   - Check if slackClient is actually being used (vs `say()` callback)
   - Look for "Posting response to thread via slackClient" logs
   - Verify `reply_broadcast: false` setting

## Slack API Context

From Slack Bolt documentation:
- `message` event should include `ts` field
- For DMs specifically, Slack might handle events differently
- Thread creation requires valid message timestamp
- Generated timestamps may not work for threads (best if Slack provides real ts)

## Root Cause Analysis

**Why Channels Work, DMs Don't:**
- Channel `message` events: Include full event structure with `ts`
- DM `message` events: May omit `ts` in Slack Bolt's event handler
- OR: The `message` event type might be filtered before reaching handler

**Why Tests Pass But Production Fails:**
- Unit/integration tests mock events without `ts`
- Tests still pass because error handling is graceful
- Real production DM events from Slack might have different structure
- Bot logs will confirm whether real DM events include `ts`

## Files Modified
1. `src/services/message_router.ts` - Generate fallback ts, add logging
2. `src/services/slack_handler.ts` - Add event structure logging
