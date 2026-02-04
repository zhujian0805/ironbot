import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  listInstalledSkills,
  removeInstalledSkill,
  installFromGitHubTree,
  overrideExecAsync,
  resetExecAsync
} from "../../skills/skill_installer/scripts/install_skill.ts";
import { executeSkill } from "../../skills/skill_installer/skill_installer.ts";
import * as installerHelper from "../../skills/skill_installer/scripts/install_skill.ts";

describe("skill_installer helpers", () => {
  const originalCwd = process.cwd();
  let stateDir: string;
  let workspaceDir: string;

  beforeEach(async ({}) => {
    stateDir = path.join(os.tmpdir(), `ironbot-state-${Date.now()}`);
    await fs.rm(stateDir, { recursive: true, force: true });
    await fs.mkdir(path.join(stateDir, "skills"), { recursive: true });
    process.env.IRONBOT_STATE_DIR = stateDir;

    workspaceDir = path.join(os.tmpdir(), `ironbot-workspace-${Date.now()}`);
    await fs.rm(workspaceDir, { recursive: true, force: true });
    await fs.mkdir(workspaceDir, { recursive: true });
    process.chdir(workspaceDir);
  });

  afterEach(async () => {
    delete process.env.IRONBOT_STATE_DIR;
    process.chdir(originalCwd);
    await fs.rm(stateDir, { recursive: true, force: true });
    await fs.rm(workspaceDir, { recursive: true, force: true });
    resetExecAsync();
  });

  it("lists skills from both state and workspace directories", async () => {
    const stateSkill = path.join(stateDir, "skills", "state-example");
    const workspaceSkill = path.join(process.cwd(), "skills", "workspace-example");
    await fs.mkdir(stateSkill, { recursive: true });
    await fs.mkdir(workspaceSkill, { recursive: true });

    const listing = await listInstalledSkills();
    expect(listing).toContain("state-example (from ~/.ironbot/skills)");
    expect(listing).toContain("workspace-example (from workspace)");
  });

  it("can remove skills from either state or workspace locations", async () => {
    const stateSkill = path.join(stateDir, "skills", "to-remove");
    const workspaceSkill = path.join(process.cwd(), "skills", "workspace-remove");
    await fs.mkdir(stateSkill, { recursive: true });
    await fs.mkdir(workspaceSkill, { recursive: true });

    const stateRemove = await removeInstalledSkill("to-remove");
    expect(stateRemove).toContain("~/.ironbot/skills");
    await expect(fs.access(stateSkill)).rejects.toThrow();

    const workspaceRemove = await removeInstalledSkill("workspace-remove");
    expect(workspaceRemove).toContain("workspace ./skills");
    await expect(fs.access(workspaceSkill)).rejects.toThrow();
  });

  it("installs a GitHub/ tree skill by cloning only the subfolder", async () => {
    const tempDir = path.join(stateDir, "temp");
    await fs.mkdir(tempDir, { recursive: true });
    const cloneDir = path.join(tempDir, "jeremylongshore-claude-code-plugins-plus-skills-main");
    const skillSegments = ["plugins", "community", "claude-never-forgets", "skills", "memory"];
    const srcSkillDir = path.join(cloneDir, ...skillSegments);
    const runLog: string[] = [];

    overrideExecAsync(async (command: string) => {
      runLog.push(command);
      await fs.mkdir(srcSkillDir, { recursive: true });
      await fs.writeFile(path.join(srcSkillDir, "SKILL.md"), "memory doc");
      return "";
    });

    const url = "https://github.com/jeremylongshore/claude-code-plugins-plus-skills/tree/main/plugins/community/claude-never-forgets/skills/memory";
    const result = await installFromGitHubTree(url, "memory");
    expect(runLog[0]).toContain("--branch \"main\"");

    const targetSkill = path.join(stateDir, "skills", "memory");
    const doc = await fs.readFile(path.join(targetSkill, "SKILL.md"), "utf-8");
    expect(doc).toBe("memory doc");
    expect(result).toContain("Successfully installed \"memory\"");
  });

  describe("skill_installer skill handler routing", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("routes list commands to the helper", async () => {
      const listSpy = vi.spyOn(installerHelper, "listInstalledSkills").mockResolvedValue("listing");
      const response = await executeSkill("list skills");
      expect(listSpy).toHaveBeenCalled();
      expect(response).toBe("listing");
    });

    it("routes uninstall commands to the remove helper", async () => {
      const removeSpy = vi.spyOn(installerHelper, "removeInstalledSkill").mockResolvedValue("removed");
      const response = await executeSkill("uninstall skill memory");
      expect(removeSpy).toHaveBeenCalledWith("memory");
      expect(response).toBe("removed");
    });
  });
});
