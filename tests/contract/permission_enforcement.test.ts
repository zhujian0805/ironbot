import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initPermissionManager } from "../../src/services/permission_manager.js";
import { ToolExecutor } from "../../src/services/tools.js";

const buildConfig = (options: {
  allowedTools: string[];
  deniedPaths?: string[];
  restrictions?: Record<string, unknown>;
}) => `version: "1.0"
settings:
  default_deny: true
  log_denials: false
tools:
  allowed: ${JSON.stringify(options.allowedTools)}
  restrictions: ${JSON.stringify(options.restrictions ?? {})}
skills:
  allowed: []
mcps:
  allowed: []
resources:
  denied_paths: ${JSON.stringify(options.deniedPaths ?? [])}
`;

describe("permission enforcement", () => {
  it("denies tools outside the allowed list", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-perm-contract-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(filePath, buildConfig({ allowedTools: ["read_file"] }));

    initPermissionManager(filePath);
    const executor = new ToolExecutor();

    const result = await executor.executeTool("write_file", { path: "/tmp/file", content: "no" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Permission denied: Tool 'write_file'");

    await rm(dir, { recursive: true, force: true });
  });

  it("denies resource paths that match deny rules", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-perm-contract-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(filePath, buildConfig({ allowedTools: ["read_file"], deniedPaths: ["/blocked/*"] }));

    initPermissionManager(filePath);
    const executor = new ToolExecutor();

    const result = await executor.executeTool("read_file", { path: "/blocked/file.txt" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Permission denied: Resource path '/blocked/file.txt'");

    await rm(dir, { recursive: true, force: true });
  });

  it("enforces tool restriction rules", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-perm-contract-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(
      filePath,
      buildConfig({
        allowedTools: ["run_bash"],
        restrictions: {
          run_bash: {
            allowed_commands: ["echo *"]
          }
        }
      })
    );

    initPermissionManager(filePath);
    const executor = new ToolExecutor();

    const result = await executor.executeTool("run_bash", { command: "ls" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Command is not in allowed_commands list");

    await rm(dir, { recursive: true, force: true });
  });
});
