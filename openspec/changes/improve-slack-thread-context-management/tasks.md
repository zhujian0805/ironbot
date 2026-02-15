## 1. Infrastructure & Setup

- [x] 1.1 Add `slackThreadContextLimit` configuration option (default: 15) to AppConfig
- [x] 1.2 Create `ThreadHistoryCache` class for in-memory caching with 5-10 minute TTL
- [x] 1.3 Verify Slack client has `conversations.replies` API available in type definitions

## 2. Message Router Enhancement

- [x] 2.1 Add `getThreadHistory(channel: string, threadTs: string): Promise<SlackMessage[]>` method to MessageRouter
- [x] 2.2 Implement caching in `getThreadHistory()` to avoid redundant API calls
- [x] 2.3 Add error handling in `getThreadHistory()` - log warnings but don't block
- [x] 2.4 Modify `handleMessage()` to call `getThreadHistory()` when `event.thread_ts` is present
- [x] 2.5 Pass thread history to `agent.processMessage()` via `skillContext` or new parameter

## 3. Claude Processor Update

- [x] 3.1 Update `claude_processor.ts` to accept thread history as input
- [x] 3.2 Create `formatThreadContext(messages: SlackMessage[]): string` function to format thread history
- [x] 3.3 Modify system prompt generation to include `<slack_thread_context>` section when thread history is available
- [x] 3.4 Ensure thread context formatting clearly separates each message with user name and text
- [x] 3.5 Mark current question separately in the prompt as "Current question: [text]"

## 4. Agent Factory / Processor Interface

- [x] 4.1 Update `AgentProcessor` interface to support thread history parameter
- [x] 4.2 Update `ClaudeProcessor.processMessage()` to accept optional thread history
- [x] 4.3 Update `PiAgentProcessor.processMessage()` to accept optional thread history
- [x] 4.4 Ensure both processor implementations use thread history when available

## 5. Testing - Unit Tests

- [ ] 5.1 Add unit tests for `ThreadHistoryCache` - caching and TTL behavior
- [ ] 5.2 Add unit tests for `getThreadHistory()` - mocking Slack API calls
- [ ] 5.3 Add unit tests for `formatThreadContext()` - correct formatting of thread messages
- [ ] 5.4 Test graceful handling when Slack API fails or returns empty
- [ ] 5.5 Update `message_router.test.ts` with thread history retrieval scenarios

## 6. Testing - Integration Tests

- [ ] 6.1 Add integration test: threaded message with follow-up question referencing previous result
- [ ] 6.2 Add integration test: anaphora resolution ("are they running?" understanding VMs)
- [ ] 6.3 Add integration test: multi-turn thread conversation with accumulated context
- [ ] 6.4 Add integration test: thread isolation (context doesn't leak between threads)
- [ ] 6.5 Add integration test: API failure gracefully falls back to transcript only

## 7. Configuration & Documentation

- [x] 7.1 Document new `slackThreadContextLimit` config option in CLAUDE.md or CONFIG.md
- [x] 7.2 Add example configuration showing how to set thread context limit
- [x] 7.3 Document Slack bot token scope requirements (should have `conversations:history`)
- [x] 7.4 Update README or development guide with notes on thread context behavior

## 8. Type Definitions

- [x] 8.1 Define `SlackMessage` type with `user`, `text`, `ts`, `type` fields
- [x] 8.2 Update `SkillContext` or create new context type to include optional `threadHistory`
- [x] 8.3 Ensure all type definitions are compatible with Slack SDK types

## 9. Monitoring & Validation

- [x] 9.1 Add logging for thread history fetch (info level with message count)
- [x] 9.2 Add logging for cache hits (debug level)
- [x] 9.3 Add warning logs for API failures
- [ ] 9.4 Create test scenarios to validate anaphora resolution works in practice

## 10. Review & Deployment Preparation

- [ ] 10.1 Code review of MessageRouter changes
- [ ] 10.2 Code review of ClaudeProcessor changes
- [x] 10.3 Verify all tests pass: `bun run test`
- [ ] 10.4 Verify TypeScript compilation: `bun run typecheck`
- [ ] 10.5 Manual testing in Slack with real threads
- [ ] 10.6 Create PR with clear description of thread context feature
