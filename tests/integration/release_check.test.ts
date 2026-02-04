import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runReleaseCheck } from "../../src/cli/check_release.ts";

const validConfig = `tools:
  - priority: 0
    name: "read_file"
    desc: "Allow read operations"
mcps: []
commands:
  - priority: 0
    name: ".*"
    desc: "Allow commands for release check"
skills: []
resurces:
  - priority: 0
    name: ".*"
    desc: "Allow resources for release check"
`;

const invalidConfig = `tools: []
mcps: []
commands: []
skills: []
resurces: []
`;

describe("release check", () => {
  it("fails when permissions config is invalid", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-release-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(filePath, invalidConfig);

    const result = runReleaseCheck(filePath);
    expect(result).toBe(false);

    await rm(dir, { recursive: true, force: true });
  });

  it("fails when permissions config is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-release-"));
    const filePath = join(dir, "missing.yaml");

    const result = runReleaseCheck(filePath);
    expect(result).toBe(false);

    await rm(dir, { recursive: true, force: true });
  });

  it("passes when permissions config is valid", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-release-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(filePath, validConfig);

    const result = runReleaseCheck(filePath);
    expect(result).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });
});
