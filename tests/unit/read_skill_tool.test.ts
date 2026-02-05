import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initPermissionManager } from "../../src/services/permission_manager.ts";
import { ToolExecutor, type SkillInfo } from "../../src/services/tools.ts";

const formatEntries = (entries: Array<{ priority: number; name: string; desc: string }>) =>
  JSON.stringify(entries ?? [], null, 2);

const buildConfig = () => `tools: ${formatEntries([
  { priority: 0, name: "read_skill", desc: "Allow read_skill" },
  { priority: 0, name: "run_powershell", desc: "Allow PowerShell" }
])}
mcps: []
commands: ${formatEntries([{ priority: 0, name: ".*", desc: "allow all commands" }])}
skills: []
resurces: []
`;

const setupPermissions = async () => {
  const dir = await mkdtemp(join(tmpdir(), "ironbot-read-skill-"));
  const filePath = join(dir, "permissions.yaml");
  await writeFile(filePath, buildConfig());
  initPermissionManager(filePath);
  return { dir, filePath };
};

describe("read_skill tool", () => {
  let tempDir: string;

  beforeEach(async () => {
    const { dir } = await setupPermissions();
    tempDir = dir;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("returns error when skill_name is not provided", async () => {
    const executor = new ToolExecutor();

    const result = await executor.executeTool("read_skill", {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("No skill_name provided");
  });

  it("returns error when skill is not found", async () => {
    const executor = new ToolExecutor();
    executor.setSkills([]);

    const result = await executor.executeTool("read_skill", { skill_name: "nonexistent" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Skill 'nonexistent' not found");
  });

  it("returns skill documentation when skill is found", async () => {
    const executor = new ToolExecutor();
    const skill: SkillInfo = {
      name: "weather",
      description: "Get weather information",
      documentation: "# Weather Skill\n\nThis skill gets weather info.",
      isExecutable: false
    };
    executor.setSkills([skill]);

    const result = await executor.executeTool("read_skill", { skill_name: "weather" });

    expect(result.success).toBe(true);
    expect(result.result).toBe("# Weather Skill\n\nThis skill gets weather info.");
    expect(result.skillName).toBe("weather");
    expect(result.isExecutable).toBe(false);
  });

  it("returns basic info when skill has no documentation", async () => {
    const executor = new ToolExecutor();
    const skill: SkillInfo = {
      name: "simple",
      description: "A simple skill",
      isExecutable: true
    };
    executor.setSkills([skill]);

    const result = await executor.executeTool("read_skill", { skill_name: "simple" });

    expect(result.success).toBe(true);
    expect(result.result).toContain("Skill: simple");
    expect(result.result).toContain("Description: A simple skill");
    expect(result.isExecutable).toBe(true);
  });

  it("lists available skills when skill not found", async () => {
    const executor = new ToolExecutor();
    const skills: SkillInfo[] = [
      { name: "skill1", description: "First skill" },
      { name: "skill2", description: "Second skill" }
    ];
    executor.setSkills(skills);

    const result = await executor.executeTool("read_skill", { skill_name: "missing" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("skill1");
    expect(result.error).toContain("skill2");
  });

  it("handles multiple skills in setSkills", async () => {
    const executor = new ToolExecutor();
    const skills: SkillInfo[] = [
      { name: "weather", description: "Weather info", documentation: "Weather docs" },
      { name: "finance", description: "Stock data", documentation: "Finance docs" },
      { name: "email", description: "Send emails", documentation: "Email docs" }
    ];
    executor.setSkills(skills);

    const weatherResult = await executor.executeTool("read_skill", { skill_name: "weather" });
    expect(weatherResult.success).toBe(true);
    expect(weatherResult.result).toBe("Weather docs");

    const financeResult = await executor.executeTool("read_skill", { skill_name: "finance" });
    expect(financeResult.success).toBe(true);
    expect(financeResult.result).toBe("Finance docs");
  });
});

describe("SkillInfo in ToolExecutor", () => {
  let tempDir: string;

  beforeEach(async () => {
    const { dir } = await setupPermissions();
    tempDir = dir;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("initializes with empty skills array", async () => {
    const executor = new ToolExecutor(undefined, undefined, []);
    
    const result = await executor.executeTool("read_skill", { skill_name: "test" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("none");
  });

  it("initializes with skills in constructor", async () => {
    const skills: SkillInfo[] = [
      { name: "test", description: "Test skill", documentation: "Test docs" }
    ];
    const executor = new ToolExecutor(undefined, undefined, skills);

    const result = await executor.executeTool("read_skill", { skill_name: "test" });
    expect(result.success).toBe(true);
    expect(result.result).toBe("Test docs");
  });

  it("setSkills replaces existing skills", async () => {
    const executor = new ToolExecutor();
    executor.setSkills([{ name: "old", description: "Old skill" }]);
    
    let result = await executor.executeTool("read_skill", { skill_name: "old" });
    expect(result.success).toBe(true);

    executor.setSkills([{ name: "new", description: "New skill" }]);
    
    result = await executor.executeTool("read_skill", { skill_name: "old" });
    expect(result.success).toBe(false);

    result = await executor.executeTool("read_skill", { skill_name: "new" });
    expect(result.success).toBe(true);
  });
});
