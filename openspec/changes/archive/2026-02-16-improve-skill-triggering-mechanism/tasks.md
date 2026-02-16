## 1. Routing metadata & configuration

- [x] 1.1 Extend `SkillLoader` to parse `metadata.openclaw.skillTriggers` (pend triggers/confidence/autoRoute) and fall back to heuristic triggers with low confidence when metadata is missing.
- [x] 1.2 Add configuration flags (env vars/config overrides) to enable/disable auto-routing globally, set the confidence threshold, and opt specific skills out of auto-routing.

## 2. ClaudeProcessor auto-routing

- [x] 2.1 Update `checkAutoRouteSkills()` to honor explicit invocations (`@skill`, `run skill`, `use skill`), respect the new confidence threshold, and consult skill opt-outs before executing.
- [x] 2.2 Emit structured logs for each auto-routing decision (skill name, trigger phrase, confidence, threshold, decision) while redacting sensitive user input.

## 3. Documentation & testing

- [x] 3.1 Document the new trigger metadata structure and configuration knobs in the developer README or CHANGELOG.
- [x] 3.2 Add unit tests for `SkillLoader` trigger parsing metadata, and for `ClaudeProcessor` auto-routing with explicit invocations, confidence gating, and opt-outs.
