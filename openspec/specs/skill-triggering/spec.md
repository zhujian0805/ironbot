# skill-triggering Specification

## Purpose
TBD - created by archiving change improve-skill-triggering-mechanism. Update Purpose after archive.
## Requirements
### Requirement: Skills declare explicit trigger metadata
Each skill SHALL be able to opt into structured trigger metadata inside `metadata.openclaw.skillTriggers`, including a list of trigger phrases, an optional `description`, and an `autoRoute` boolean flag that defaults to `true`. When metadata is absent, the loader MAY fall back to existing heuristics but SHALL tag those triggers with a confidence value below the auto-routing threshold.

#### Scenario: Loader reads explicit metadata
- **WHEN** a skill directory includes `metadata.openclaw.skillTriggers.triggers`
- **THEN** the loader extracts the phrases and records them on the `SkillInfo` for use by `checkAutoRouteSkills()`

### Requirement: Explicit invocation patterns bypass confidence gating
The processor SHALL treat direct invocations using `@skill-name`, `run skill <skill-name>`, or `use skill` as high-confidence triggers regardless of the configured confidence threshold. These invocations SHALL fire the referenced skill before considering other candidates.

#### Scenario: User mentions `@skillname`
- **WHEN** the message contains an exact `@skillname` mention
- **THEN** `checkAutoRouteSkills()` immediately executes that skill and logs the explicit invocation

### Requirement: Auto-routing respects confidence thresholds
When no explicit invocation exists, `checkAutoRouteSkills()` SHALL rank auto-route candidates by their declared confidence (default 0.3 for heuristics) and only execute a skill whose confidence meets or exceeds the configurable threshold (`CLAUDE_AUTO_ROUTE_CONFIDENCE`). If no candidate meets the threshold, the processor SHALL return `null`.

#### Scenario: Low-confidence trigger is suppressed
- **WHEN** a skill with confidence 0.25 matches the message and the threshold is 0.5
- **THEN** the processor declines to auto-route and allows Claude to handle the message

### Requirement: Operators can configure auto-routing scope
The system SHALL expose configuration (environment variables or operator-facing overrides) for enabling/disabling auto-routing globally, setting the confidence threshold, and opting out individual skills. Opt-out flags SHALL prevent a skill from auto-routing even if other requirements would normally allow it.

#### Scenario: Skill added to opt-out list
- **WHEN** the operator adds `skill_installer` to the opt-out configuration
- **THEN** `checkAutoRouteSkills()` never executes `skill_installer` automatically regardless of trigger matches

### Requirement: Routing decisions are instrumented
Each auto-routing attempt SHALL emit a structured log entry with the candidate skill name, trigger phrase, declared confidence, threshold value, and decision (executed/suppressed). Logs SHALL redact sensitive user input before storage.

#### Scenario: Execution decision logged
- **WHEN** a skill auto-routes successfully
- **THEN** the log includes the skill name, trigger phrase, confidence score, and success status without exposing raw user content

