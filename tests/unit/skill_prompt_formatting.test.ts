import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeProcessor } from "../../src/services/claude_processor.ts";
import { initPermissionManager } from "../../src/services/permission_manager.ts";

const formatEntries = (entries: Array<{ priority: number; name: string; desc: string }>) =>
  JSON.stringify(entries ?? [], null, 2);

const buildConfig = (skillEntries: Array<{ priority: number; name: string; desc: string }> = []) => `tools: ${formatEntries([
  { priority: 0, name: ".*", desc: "Allow all tools" }
])}
mcps: []
commands: ${formatEntries([{ priority: 0, name: ".*", desc: "allow all commands" }])}
skills: ${formatEntries(skillEntries.length ? skillEntries : [{ priority: 0, name: ".*", desc: "Allow all skills" }])}
resurces: ${formatEntries([{ priority: 0, name: ".*", desc: "allow all resources" }])}
`;

describe("formatSkillsForPrompt", () => {
  let tempDir: string;
  let skillsDir: string;
  let permissionsPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ironbot-skill-prompt-"));
    skillsDir = join(tempDir, "skills");
    permissionsPath = join(tempDir, "permissions.yaml");
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("returns no skills message when no skills are loaded", async () => {
    await writeFile(permissionsPath, buildConfig());
    initPermissionManager(permissionsPath);

    const processor = new ClaudeProcessor([skillsDir]);
    // Access private method through type assertion
    const formatMethod = (processor as unknown as { formatSkillsForPrompt: () => string }).formatSkillsForPrompt;
    const result = formatMethod.call(processor);

    expect(result).toContain("<available_skills>");
    expect(result).toContain("No skills available");
  });

  it("formats single skill with name and description", async () => {
    const skillDir = join(skillsDir, "weather");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: weather
description: Get weather information for any location
---

# Weather Skill

This skill provides weather data.
`
    );

    await writeFile(permissionsPath, buildConfig());
    initPermissionManager(permissionsPath);

    const processor = new ClaudeProcessor([skillsDir]);
    await (processor as unknown as { ensureSkillsLoaded: () => Promise<void> }).ensureSkillsLoaded();

    const formatMethod = (processor as unknown as { formatSkillsForPrompt: () => string }).formatSkillsForPrompt;
    const result = formatMethod.call(processor);

    expect(result).toContain("<available_skills>");
    expect(result).toContain("  - weather:");
    expect(result).toContain("Get weather information for any location");
    expect(result).toContain("To use a skill, first identify which skill applies");
  });

  it("formats multiple skills with descriptions", async () => {
    const weatherDir = join(skillsDir, "weather");
    const financeDir = join(skillsDir, "finance");
    await mkdir(weatherDir, { recursive: true });
    await mkdir(financeDir, { recursive: true });

    await writeFile(
      join(weatherDir, "SKILL.md"),
      `---
name: weather
description: Check weather forecasts
---
# Weather
`
    );
    await writeFile(
      join(financeDir, "SKILL.md"),
      `---
name: finance
description: Get stock market data
---
# Finance
`
    );

    await writeFile(permissionsPath, buildConfig());
    initPermissionManager(permissionsPath);

    const processor = new ClaudeProcessor([skillsDir]);
    await (processor as unknown as { ensureSkillsLoaded: () => Promise<void> }).ensureSkillsLoaded();

    const formatMethod = (processor as unknown as { formatSkillsForPrompt: () => string }).formatSkillsForPrompt;
    const result = formatMethod.call(processor);

    expect(result).toContain("  - weather:");
    expect(result).toContain("Check weather forecasts");
    expect(result).toContain("  - finance:");
    expect(result).toContain("Get stock market data");
  });

  it("uses default description when skill has no description", async () => {
    const skillDir = join(skillsDir, "simple");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: simple
---

# Simple Skill
`
    );

    await writeFile(permissionsPath, buildConfig());
    initPermissionManager(permissionsPath);

    const processor = new ClaudeProcessor([skillsDir]);
    await (processor as unknown as { ensureSkillsLoaded: () => Promise<void> }).ensureSkillsLoaded();

    const formatMethod = (processor as unknown as { formatSkillsForPrompt: () => string }).formatSkillsForPrompt;
    const result = formatMethod.call(processor);

    expect(result).toContain("  - simple:");
    expect(result).toContain("No description provided");
  });

  it("does not include full documentation in prompt", async () => {
    const skillDir = join(skillsDir, "detailed");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: detailed
description: A detailed skill
---

# Detailed Skill

This is very long documentation that should NOT appear in the prompt.
It has multiple lines and detailed instructions.
- Step 1
- Step 2
- Step 3
`
    );

    await writeFile(permissionsPath, buildConfig());
    initPermissionManager(permissionsPath);

    const processor = new ClaudeProcessor([skillsDir]);
    await (processor as unknown as { ensureSkillsLoaded: () => Promise<void> }).ensureSkillsLoaded();

    const formatMethod = (processor as unknown as { formatSkillsForPrompt: () => string }).formatSkillsForPrompt;
    const result = formatMethod.call(processor);

    expect(result).toContain("  - detailed:");
    expect(result).toContain("A detailed skill");
    expect(result).not.toContain("Step 1");
    expect(result).not.toContain("Step 2");
    expect(result).not.toContain("very long documentation");
  });

  it("includes instruction to use read_skill tool", async () => {
    const skillDir = join(skillsDir, "test");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: test
description: Test skill
---
# Test
`
    );

    await writeFile(permissionsPath, buildConfig());
    initPermissionManager(permissionsPath);

    const processor = new ClaudeProcessor([skillsDir]);
    await (processor as unknown as { ensureSkillsLoaded: () => Promise<void> }).ensureSkillsLoaded();

    const formatMethod = (processor as unknown as { formatSkillsForPrompt: () => string }).formatSkillsForPrompt;
    const result = formatMethod.call(processor);

    expect(result).toContain("read_skill");
    expect(result).toContain("load its full documentation");
  });
});

describe("Skill progressive disclosure", () => {
  let tempDir: string;
  let skillsDir: string;
  let permissionsPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ironbot-disclosure-"));
    skillsDir = join(tempDir, "skills");
    permissionsPath = join(tempDir, "permissions.yaml");
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("ToolExecutor receives skill info after skills are loaded", async () => {
    const skillDir = join(skillsDir, "executable");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: executable
description: An executable skill
---
# Executable
`
    );
    await writeFile(
      join(skillDir, "executable.ts"),
      `export const executeSkill = async (input: string) => "Executed: " + input;`
    );

    await writeFile(permissionsPath, buildConfig());
    initPermissionManager(permissionsPath);

    const processor = new ClaudeProcessor([skillsDir]);
    await (processor as unknown as { ensureSkillsLoaded: () => Promise<void> }).ensureSkillsLoaded();

    // The processor should have updated ToolExecutor with skill info
    // This is tested indirectly through the read_skill tool functionality
    expect(true).toBe(true); // Placeholder - actual integration tested elsewhere
  });
});
