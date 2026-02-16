## Why
The current skill routing flow kicks off a skill as soon as `findAutoRouteSkill()` sees a substring match against `SkillInfo.triggers`. Those triggers are mostly inferred from skill names or heuristic keywords (`install`, `weather`, `email`, etc.) and live a few layers away from the user verb. As a result, routine conversations that mention one of those keywords or a skill's name trigger a skill immediately, making it hard to reason about which skill consumed a message and why. We also have no signal for surfaced misfires, so we are blind to whether auto-routing is happening too eagerly or silently sabotaging Claude's normal processing. Improving the triggering mechanism now will make auto-routing more predictable before it grows into a bigger reliability issue as we add more skills.

## What Changes
- Teach each skill to declare explicit trigger metadata (instead of relying solely on auto-generated keywords) and allow skills to opt out of auto-routing. The loader will surface structured triggers for `findAutoRouteSkill()` to consume.
- Extend `checkAutoRouteSkills()` to be more discerning: prefer explicit invocation patterns such as @skill or run skill, reason about trigger confidence, and log why (or why not) a skill ran so we can debug false positives.
- Add surface-level configuration and instrumentation so operators can limit auto-routing scope (for example, per-skill toggles or a minimum confidence level) and inspect which messages auto-routed to which skill.

## Capabilities

### New Capabilities
- `skill-triggering`: Defines the contract around how skills declare valid activation cues, how the processor decides to auto-route, and what observability and controls exist so human operators can understand and tune that behavior.

### Modified Capabilities
- `<existing-name>`: <what requirement is changing>

## Impact
- `src/services/skill_loader.ts` (trigger metadata extraction, new metadata fields, support for opt-out)
- `src/services/claude_processor.ts` (trigger confidence, logging, explicit invocation handling)
- Configuration surface (CLI flags or env vars that guard auto-routing)
- `tests/unit/claude_processor.test.ts` and `tests/unit/skill_loader.test.ts` (new cases around trigger metadata and routing heuristics)
- Documentation or CHANGELOG to explain how to tune the new trigger controls
