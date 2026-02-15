# Slack Thread Context Retrieval

## Purpose

Enable ironbot to automatically fetch and include Slack thread history when processing messages in threads, improving context awareness for follow-up questions and enabling better anaphora resolution.

## Requirements

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
- **THEN** the system correctly identifies "they" refers to the VMs
- **AND** responds with status information about those VMs without asking for clarification

#### Scenario: Resolve implicit subject
- **WHEN** user asks "show me the details" in a thread about a specific command result
- **THEN** the system understands the implicit subject refers to the previous result
- **AND** provides details without requesting clarification

#### Scenario: Clarify ambiguous references
- **WHEN** a reference cannot be clearly resolved (e.g., multiple possible antecedents)
- **THEN** the system makes a reasonable inference based on context
- **AND** proceeds with the most likely interpretation
