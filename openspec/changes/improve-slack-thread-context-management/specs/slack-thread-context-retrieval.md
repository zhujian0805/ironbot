## ADDED Requirements

### Requirement: Slack Thread History Retrieval
The system SHALL automatically fetch and include previous messages from the Slack thread when processing a message that is part of a thread (when thread_ts is present).

#### Scenario: Fetch history for threaded message
- **WHEN** user sends a message in a Slack thread
- **THEN** the system retrieves the thread's conversation history from the Slack API
- **AND** the retrieved messages are passed to the LLM processor

#### Scenario: Skip history for non-threaded message
- **WHEN** user sends a message in a channel (not in a thread)
- **THEN** the system does NOT attempt to fetch thread history
- **AND** processing continues normally with transcript history

#### Scenario: Gracefully handle API failure
- **WHEN** Slack API fails to return thread history
- **THEN** the system logs a warning
- **AND** processing continues without thread history (does not block message processing)

### Requirement: Thread History Caching
The system SHALL cache retrieved thread history to avoid redundant API calls for the same thread within a short time period.

#### Scenario: Return cached history
- **WHEN** thread history is requested for the same thread within 5-10 minutes
- **THEN** the cached history is returned instead of making a new API call

#### Scenario: Expire cached history
- **WHEN** the cache expiration time is exceeded
- **THEN** the next thread history request fetches fresh data from the Slack API

### Requirement: Thread Context in System Prompt
The system SHALL include retrieved thread history in the LLM system prompt using a structured format that clearly separates thread context from the current message.

#### Scenario: Include thread messages in prompt
- **WHEN** thread history is available
- **THEN** the system prompt includes a `<slack_thread_context>` section
- **AND** each thread message is formatted as "User: message text"
- **AND** the current question is marked separately as "Current question: [text]"

#### Scenario: Handle empty thread
- **WHEN** thread history is empty or not retrieved
- **THEN** the system still processes the message
- **AND** no `<slack_thread_context>` section is added to the prompt

### Requirement: Anaphora Resolution
The system SHALL resolve pronouns and references to entities mentioned in previous thread messages when interpreting user questions.

#### Scenario: Resolve pronoun reference
- **WHEN** user asks "are they running?" in a thread where VMs were listed earlier
- **THEN** the system understands "they" refers to the previously mentioned VMs
- **AND** responds with status information about those VMs without asking for clarification

#### Scenario: Resolve implicit subject
- **WHEN** user asks "show me the details" in a thread about a specific command result
- **THEN** the system understands the implicit subject refers to the previous result
- **AND** provides details without requesting clarification

#### Scenario: Clarify ambiguous references
- **WHEN** a reference cannot be clearly resolved (e.g., multiple possible antecedents)
- **THEN** the system makes a reasonable inference based on context
- **AND** proceeds with the most likely interpretation

### Requirement: Thread Context Persistence
The system SHALL maintain accumulated context across multiple messages within a single Slack thread by combining Slack thread history with internally-stored transcript history.

#### Scenario: Accumulate context across follow-ups
- **WHEN** a user asks multiple follow-up questions in the same thread
- **THEN** each new message includes context from all previous messages in that thread
- **AND** the system can answer questions that reference any earlier message

#### Scenario: Thread isolation
- **WHEN** user has separate threads in the same channel
- **THEN** each thread maintains its own isolated context
- **AND** follow-up questions in one thread do not reference messages from other threads

## MODIFIED Requirements

### Requirement: Message Processing Workflow
The system SHALL process incoming Slack messages by first retrieving relevant context, then routing to the appropriate LLM processor.

**Updated Behavior**: When processing a message in a thread, the message router SHALL fetch the thread history from Slack before invoking the LLM processor.

#### Scenario: Thread message with history
- **WHEN** a message arrives with a thread_ts value
- **THEN** the message router fetches thread history from Slack API
- **AND** includes the thread history in the message context passed to the LLM processor
- **AND** the processor uses thread history to improve response quality

#### Scenario: Channel message without history fetch
- **WHEN** a message arrives without a thread_ts value
- **THEN** the message router does NOT fetch from Slack API
- **AND** uses only the internal transcript history
- **AND** processing time is minimized

#### Scenario: DM message handling
- **WHEN** a message is a direct message (channel starts with 'D')
- **THEN** the system does NOT fetch thread history
- **AND** uses only the internal transcript history for context
