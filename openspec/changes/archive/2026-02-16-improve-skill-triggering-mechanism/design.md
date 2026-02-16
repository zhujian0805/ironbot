## Context
Skill auto-routing today is driven almost entirely by heuristic triggers that `SkillLoader` fabricates from skill names/descriptions and the limited `metadata.openclaw.triggers` list (`src/services/skill_loader.ts`). When `ClaudeProcessor.checkAutoRouteSkills()` sees a substring match, it immediately invokes the handler; documentation-type skills are blocked, but everything else executes without operator visibility. We also have zero confidence/logging about why a route was chosen, which means Claude's normal LLM path can get hijacked without explanation, especially once more skills arrive.

This change follows the proposal's new `skill-triggering` capability: explicit trigger declarations, better routing criteria, and instrumentation/control surfaces for operators. The design must balance improving precision with keeping auto-routing responsive for obvious invocations.

## Goals / Non-Goals
**Goals:**
- Introduce explicit trigger metadata (declaration + confidence/opt-out) so skill authors control routing cues instead of opaque heuristics.
- Make `checkAutoRouteSkills()` evaluate explicit invocations first (`@skill`, `run skill`) and only fall back to trusted triggers when confidence is high, while logging routing decisions.
- Surface configuration (per-skill toggle, confidence threshold, opt-out) and telemetry so operators can monitor auto-routing behavior before rolling it out widely.

**Non-Goals:**
- Rebuilding the entire skill discovery pipeline or forcing every existing skill to define triggers immediately; we can default unspecified metadata to existing heuristics with low confidence.
- Replacing Claude’s decision-making about tool usage; auto-routing should still avoid interfering when Claude wants to handle the prompt itself.

## Decisions
1. **Metadata schema** – Add a `skillTriggers` object under `metadata.openclaw` (e.g., `triggers`, `confidence`, `autoRoute: boolean`). Default triggers fall back to current heuristic generation so we don’t break existing skills; explicit metadata overrides the heuristics and can declare `autoRoute: false` to opt out.
2. **Routing logic order** – Extend `checkAutoRouteSkills()` to:
   - First check for explicit invocation patterns: `@skillname`, `run skill <name>`, or `use skill`.
   - If found, short-circuit to that skill regardless of confidence to keep command-style flows responsive.
   - Otherwise, iterate over skills with `autoRoute !== false`, rank candidates by declared confidence (default from heuristics = 0.3), and only auto-route if the confidence meets a configurable threshold (`CLAUDE_SKILL_AUTO_ROUTE_CONFIDENCE`, default 0.5).
   - Log candidate scores and final decision for telemetry.
3. **Instrumentation & opt-out** – Emit structured logs (skill name, trigger match, confidence, success/failure) and expose an opt-out list (env var or config file) that disables auto-routing for specific skills or entire categories. This gives operators a kill-switch without redeploying.
4. **Configuration surface** – Provide env vars (e.g., `CLAUDE_AUTO_ROUTES_ENABLED`, `CLAUDE_AUTO_ROUTE_CONFIDENCE`) and optionally per-skill overrides so rollout can be gradual. Document them in README/CHANGELOG.

## Risks / Trade-offs
- **Risk:** Increasing routing strictness could make legitimate skill invocations fail. Mitigation: keep heuristics as a fallback with low confidence, log misses, and allow ops to lower the threshold.
- **Risk:** Structured logs could leak sensitive user commands if not redacted. Mitigation: scrub userMessage before logging and ensure telemetry only records route decisions.
- **Trade-off:** More configuration makes onboarding new skills heavier. Balance by defaulting metadata to heuristics and allowing skill authors to opt-in for tighter control.

## Migration Plan
1. Update `SkillLoader` to parse new metadata fields and keep the legacy heuristics path intact.
2. Adjust `claude_processor.ts` so `checkAutoRouteSkills()` consumes the new metadata, logs routing decisions, and obeys the confidence threshold and opt-outs.
3. Add unit tests covering explicit invocation handling, confidence gating, and opt-out-invocations.
4. Document the new environment variables and how to define triggers inside SKILL.md.
5. Monitor logs after deployment; if false positives spike, lower the confidence threshold or add the offending skill to the opt-out list before rolling out further.

## Open Questions
- Should we expose configuration through a JSON file alongside the CLI (e.g., `skills.autoRoutingOverrides`) or stick to environment variables?
- How should we surface auto-routing decisions to Claude logs or operator dashboards—only structured logs, or also metrics (counter per skill)?
- When a skill is explicitly invoked with `@skill` but the metadata flag `autoRoute: false` is set, should we respect the explicit command or still defer to Claude? Current plan honors explicit commands.
