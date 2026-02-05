import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SkillLoader } from "../../src/services/skill_loader.ts";

const temporaryRoot = path.join(os.tmpdir(), "skill-loader-tests");

const writeSkill = async (skillDir: string, content: string, mdFrontmatter?: string) => {
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, `${path.basename(skillDir)}.js`), content);
  const skillMd = mdFrontmatter
    ? `---\n${mdFrontmatter}\n---\n# ${path.basename(skillDir)}\n`
    : `# ${path.basename(skillDir)}\n`;
  await fs.writeFile(path.join(skillDir, "SKILL.md"), skillMd);
};

describe("SkillLoader auto-route triggers", () => {
  beforeEach(async () => {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
    await fs.mkdir(temporaryRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  });

  it("honors explicit skillTriggers metadata", async () => {
    const skillDir = path.join(temporaryRoot, "meta-skill");
    const frontmatter = `
metadata:
  openclaw:
    skillTriggers:
      triggers:
        - "explicit"
        - "meta"
      confidence: 0.92
      autoRoute: false
    `;
    await writeSkill(
      skillDir,
      'export const executeSkill = async () => "meta";',
      frontmatter
    );

    const loader = new SkillLoader([temporaryRoot]);
    await loader.loadSkills();
    const info = loader.getSkillInfo()["meta-skill"];

    expect(info).toBeDefined();
    expect(info.triggerConfig?.source).toBe("metadata");
    expect(info.triggerConfig?.confidence).toBeCloseTo(0.92);
    expect(info.triggerConfig?.autoRoute).toBe(false);
    expect(info.triggerConfig?.triggers).toContain("explicit");
  });

  it("falls back to heuristics when metadata is missing", async () => {
    const skillDir = path.join(temporaryRoot, "assist-skill");
    const frontmatter = `
description: Helps with install flows
    `;
    await writeSkill(
      skillDir,
      'export const executeSkill = async () => "assist";',
      frontmatter
    );

    const loader = new SkillLoader([temporaryRoot]);
    await loader.loadSkills();
    const info = loader.getSkillInfo()["assist-skill"];

    expect(info).toBeDefined();
    expect(info.triggerConfig?.source).toBe("heuristic");
    expect(info.triggerConfig?.triggers).toContain("install");
    expect(info.triggerConfig?.autoRoute).toBe(true);
  });
});
