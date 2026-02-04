import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initPermissionManager } from "../../src/services/permission_manager.ts";
import { ToolExecutor } from "../../src/services/tools.ts";

const formatSection = (entries: Array<Record<string, unknown>>) => JSON.stringify(entries ?? [], null, 2);

const buildConfig = (options: {
  toolRules?: Array<{ priority: number; name: string; desc: string }>;
  resourceRules?: Array<{ priority: number; name: string; desc: string }>;
  commandRules?: Array<{ priority: number; name: string; desc: string }>;
}) => `tools: ${formatSection(options.toolRules ?? [])}
mcps: []
commands: ${formatSection(options.commandRules ?? [{ priority: 0, name: ".*", desc: "Allow all commands" }])}
skills: []
resurces: ${formatSection(options.resourceRules ?? [])}
`;

describe("permission enforcement", () => {
  it("denies tools outside the allowed list", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-perm-contract-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(
      filePath,
      buildConfig({
        toolRules: [{ priority: 0, name: "read_file", desc: "Allow read only" }]
      })
    );

    initPermissionManager(filePath);
    const executor = new ToolExecutor();

    const result = await executor.executeTool("write_file", { path: "/tmp/file", content: "deny" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Permission denied: Tool 'write_file'");

    await rm(dir, { recursive: true, force: true });
  });

  it("denies resource paths that are not listed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-perm-contract-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(
      filePath,
      buildConfig({
        toolRules: [{ priority: 0, name: "read_file", desc: "Allow read file" }],
        resourceRules: [{ priority: 0, name: "/allowed/.*", desc: "Only allow /allowed" }]
      })
    );

    initPermissionManager(filePath);
    const executor = new ToolExecutor();

    const result = await executor.executeTool("read_file", { path: "/blocked/secret.txt" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Permission denied: Resource path '/blocked/secret.txt'");

    await rm(dir, { recursive: true, force: true });
  });

  it("denies commands that do not match command policy", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-perm-contract-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(
      filePath,
      buildConfig({
        toolRules: [{ priority: 0, name: "run_bash", desc: "Allow bash" }],
        commandRules: [{ priority: 0, name: "^safe", desc: "Allow only safe commands" }]
      })
    );

    initPermissionManager(filePath);
    const executor = new ToolExecutor();

    const result = await executor.executeTool("run_bash", { command: "rm -rf /" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Command blocked: This operation is not permitted by policy");

    await rm(dir, { recursive: true, force: true });
  });
});
