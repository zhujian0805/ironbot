## Why

Ironbot loses context within the same Slack thread when responding to follow-up questions. When a user asks a follow-up question (e.g., "are they running?") that refers to information from a previous response in the same thread, ironbot fails to recognize the reference and instead asks for clarification. This breaks the natural conversational flow and creates a poor user experience in multi-turn conversations.

## What Changes

- Enhance message routing to retrieve and include previous messages from the same Slack thread as context
- Implement context-aware reasoning to understand pronouns, references, and implicit subjects from previous responses
- Maintain a thread-local context store that persists across multiple messages in a single thread
- Improve Claude processor to leverage thread context when answering follow-up questions
- Ensure references to previous command results are properly resolved without requiring users to repeat themselves

## Capabilities

### New Capabilities
- `slack-thread-context-retrieval`: Automatically fetch and include previous messages from the same Slack thread when processing new messages
- `anaphora-resolution`: Resolve pronouns and references (e.g., "they", "it", "that VM") to entities mentioned in previous thread messages
- `thread-context-persistence`: Maintain accumulated context across multiple messages within a single Slack thread

### Modified Capabilities
- `slack-message-processing`: Update to incorporate thread history and context from previous messages before routing to LLM providers

## Impact

- **Services affected**: `message_router.ts` (to fetch thread history), `claude_processor.ts` (to include context in prompts)
- **APIs affected**: Slack Bolt Socket Mode API (need to retrieve conversation history from threads)
- **Configuration**: May require Slack bot token scopes for reading channel history (if not already present)
- **Testing**: New tests needed for thread context retrieval and multi-message scenarios
