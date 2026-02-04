import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { executeSkill } from "../../skills/permission_check/permission_check.ts";

const allowedSkills = new Set<string>();

const permissionManagerStub = {
  listAllowedCapabilities: () => ({ tools: ["run_powershell"], skills: Array.from(allowedSkills), mcps: [] }),
  listPolicyNames: () => ["*"],
  isSkillAllowed: (name: string) => allowedSkills.has(name),
  isCommandAllowed: () => true
};

vi.mock("../../src/services/permission_manager.ts", () => ({
  getPermissionManager: () => permissionManagerStub
}));

describe("permission_check skill", () => {
  let stateDir: string;
  let workspaceDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    allowedSkills.clear();

    stateDir = path.join(os.tmpdir(), `ironbot-state-${Date.now()}`);
    await fs.rm(stateDir, { recursive: true, force: true });
    await fs.mkdir(path.join(stateDir, "skills"), { recursive: true });
    process.env.IRONBOT_STATE_DIR = stateDir;

    workspaceDir = path.join(os.tmpdir(), `ironbot-workspace-${Date.now()}`);
    await fs.rm(workspaceDir, { recursive: true, force: true });
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(path.join(workspaceDir, "skills"), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(workspaceDir);
  });

  afterEach(async () => {
    delete process.env.IRONBOT_STATE_DIR;
    process.chdir(originalCwd);
    await fs.rm(stateDir, { recursive: true, force: true });
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it("reports skills from both workspace and state directories", async () => {
    const workspaceSkill = path.join(workspaceDir, "skills", "alpha");
    const stateSkill = path.join(stateDir, "skills", "beta");
    await fs.mkdir(workspaceSkill, { recursive: true });
    await fs.mkdir(stateSkill, { recursive: true });
    allowedSkills.add("alpha");

    const output = await executeSkill("check");
    expect(output).toContain("alpha (directory, workspace ./skills)");
    expect(output).toMatch(/beta \(directory, ~\/\.ironbot\/skills\).*blocked/);
    expect(output).toContain("**📋 Allowed Skills:** alpha");
  });
});
