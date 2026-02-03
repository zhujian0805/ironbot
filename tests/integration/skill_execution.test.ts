import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initPermissionManager } from "../../src/services/permission_manager.ts";
import { SkillLoader } from "../../src/services/skill_loader.ts";

const buildConfig = (allowedSkills: string[]) => `version: "1.0"
settings:
  default_deny: true
  log_denials: false
tools:
  allowed: []
skills:
  allowed: ${JSON.stringify(allowedSkills)}
mcps:
  allowed: []
resources:
  denied_paths: []
`;

describe("skill execution", () => {
  it("loads JavaScript skill modules from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-skill-"));
    const permissionsFile = join(dir, "permissions.yaml");
    await writeFile(permissionsFile, buildConfig(["*"]));

    const skillPath = join(dir, "hello.ts");
    await writeFile(
      skillPath,
      "export const executeSkill = (input) => `Hello ${input}`;"
    );

    initPermissionManager(permissionsFile);
    const loader = new SkillLoader([dir]);
    const skills = await loader.loadSkills();

    expect(skills.hello).toBeDefined();
    const result = await skills.hello?.("world");
    expect(result).toBe("Hello world");

    await rm(dir, { recursive: true, force: true });
  });

  it("skips skills blocked by permission rules", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-skill-"));
    const permissionsFile = join(dir, "permissions.yaml");
    await writeFile(permissionsFile, buildConfig([]));

    const skillPath = join(dir, "blocked.ts");
    await writeFile(skillPath, "export const executeSkill = () => 'nope';");

    initPermissionManager(permissionsFile);
    const loader = new SkillLoader([dir]);
    const skills = await loader.loadSkills();

    expect(skills.blocked).toBeUndefined();

    await rm(dir, { recursive: true, force: true });
  });

  it("skips underscore-prefixed skill files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-skill-"));
    const permissionsFile = join(dir, "permissions.yaml");
    await writeFile(permissionsFile, buildConfig(["*"]));

    const skillPath = join(dir, "_hidden.ts");
    await writeFile(skillPath, "export const executeSkill = () => 'hidden';");

    initPermissionManager(permissionsFile);
    const loader = new SkillLoader([dir]);
    const skills = await loader.loadSkills();

    expect(skills._hidden).toBeUndefined();

    await rm(dir, { recursive: true, force: true });
  });
});
