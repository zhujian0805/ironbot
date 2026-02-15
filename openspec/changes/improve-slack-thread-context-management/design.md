## Context

Ironbot processes messages using a transcript-based conversation history system (`message_router.ts`) that stores past exchanges in JSONL files. When responding to follow-up questions in Slack threads, the system relies on this stored history to maintain context. However, the current implementation does not retrieve the actual Slack thread conversation history from the Slack API, only the internally-managed transcript.

The problem manifests when a user asks a follow-up question that uses pronouns or implicit references (e.g., "are they running?" referring to VMs from a previous response). Without access to the exact wording and context from the previous Slack message, Claude cannot resolve these references, leading to requests for clarification.

**Current Flow:**
1. User message arrives in thread
2. `message_router` loads internal transcript history
3. `claude_processor` receives message + transcript history
4. Claude responds
5. Slack thread history from API is never accessed

## Goals / Non-Goals

**Goals:**
- Retrieve actual Slack thread conversation history from the Slack API when processing messages in a thread
- Include thread context in Claude's system prompt to improve understanding of pronouns and references
- Resolve anaphora (pronouns referring to previous entities) without requiring user clarification
- Maintain backward compatibility with non-thread messages and DMs
- Keep thread history retrieval efficient (avoid excessive API calls)

**Non-Goals:**
- Replace the existing transcript-based conversation history system
- Implement persistent memory or knowledge base features
- Support thread history older than Slack's conversation.history limit (typically 90 days)
- Modify the underlying session/transcript storage system
- Add UI/configuration options for thread depth or context window

## Decisions

### 1. **Slack API Integration for Thread History**
**Decision**: Use Slack's `conversations.replies` API endpoint to fetch thread messages

**Rationale**:
- This is the native Slack API method for retrieving thread history
- Provides exact message text, user, timestamp, and metadata
- Alternative (reading from local context) would miss messages from other users and bots

**Implementation**:
- Add method `getThreadHistory()` to `MessageRouter`
- Accept `channel`, `threadTs`, and optional `limit` parameter
- Cache results briefly (5-10 minutes) to avoid repeated API calls for the same thread
- Error handling: log warning and continue without thread history if API call fails

### 2. **Thread Context Packaging for Claude**
**Decision**: Format thread history as structured context in the system prompt before sending to Claude

**Rationale**:
- Embedding thread history directly in system context (vs. message history) ensures Claude treats it as immutable reference material
- Allows Claude to reason about references without confusion about which messages are current
- Easier to implement without breaking existing transcript system

**Implementation**:
- New section in system prompt: `<slack_thread_context>` block
- Format: `User name: message text` for each message in thread
- Include bot responses for completeness
- Mark current question separately: `Current question: [user message]`

### 3. **Thread History Scope**
**Decision**: Include last 10-20 messages from the thread (configurable)

**Rationale**:
- Provides enough context for anaphora resolution without overwhelming token budget
- Prevents token bloat while covering typical follow-up question scenarios
- 10-20 messages typical for a task-focused conversation thread

**Implementation**:
- Add config option: `slackThreadContextLimit` (default: 15)
- Fetch up to `limit` messages before current message

### 4. **When to Fetch Thread History**
**Decision**: Fetch thread history only when processing messages in a thread (when `event.thread_ts` is set)

**Rationale**:
- Avoids unnecessary API calls for channel messages or DMs
- Keeps implementation simple and performance-conscious
- Thread context is irrelevant for non-thread messages

**Implementation**:
- Check `if (event.thread_ts)` before calling `getThreadHistory()`
- Pass thread context to `agent.processMessage()` via a new `skillContext` property

### 5. **Backward Compatibility**
**Decision**: Thread history is optional; system works normally if API call fails or returns empty

**Rationale**:
- Reduces brittleness; single API failure won't break the bot
- Graceful degradation if permissions insufficient or API unavailable
- Existing transcript history provides fallback context

**Implementation**:
- Try/catch around `getThreadHistory()` call
- If empty or error, proceed without thread history
- No changes required to `claude_processor` signature

## Risks / Trade-offs

### [Risk: API Rate Limiting]
**Mitigation**: Implement brief in-memory caching (5-10 min) of thread history to avoid repeated calls for the same thread. Monitor Slack API rate limits and add instrumentation.

### [Risk: Token Budget Impact]
**Mitigation**: Limit thread history to 15-20 messages by default; make configurable. Thread context is added only for threaded messages, not channel/DM.

### [Risk: Stale Context in Long-Running Threads]
**Mitigation**: Cache for only 5-10 minutes; if thread is active for hours, fresh context will be fetched. Document that context is point-in-time.

### [Risk: Permission Errors]
**Mitigation**: Slack bot requires `conversations:history` scope (likely already present). If missing, log warning and continue without thread history. Not a breaking change.

### [Risk: Complex References]
**Mitigation**: Anaphora resolution is improved but not perfect. Complex multi-step references may still require clarification. This is expected behavior.

## Migration Plan

**Phase 1: Implementation**
1. Add `getThreadHistory()` method to `MessageRouter` with caching
2. Modify `handleMessage()` to fetch thread context when `event.thread_ts` is set
3. Pass thread context to `agent.processMessage()` via `skillContext`
4. Update `claude_processor.ts` system prompt to use `<slack_thread_context>` block

**Phase 2: Testing**
1. Unit tests for `getThreadHistory()` with mock Slack client
2. Integration tests with live thread scenarios (thread with multiple messages)
3. Test anaphora resolution: "are they running?" → understands VMs
4. Test error cases: missing thread_ts, API failures, empty thread

**Phase 3: Deployment**
1. Deploy to staging/dev for team testing in real Slack threads
2. Monitor Slack API usage for rate limiting
3. Deploy to production
4. Monitor logs for any thread history fetch failures

**Rollback**: If issues arise, remove `getThreadHistory()` calls and thread context formatting; bot reverts to transcript-only context.

## Open Questions

1. **Token budget**: What's the typical message count in threads where clarification occurs? Should we monitor token usage?
2. **Slack permissions**: Should we validate that the bot has `conversations:history` scope on startup?
3. **Cache strategy**: Is 5-10 minute cache sufficient, or should it be based on thread activity?
4. **System prompt**: Should thread context be formatted differently if thread is very long (50+ messages)?
