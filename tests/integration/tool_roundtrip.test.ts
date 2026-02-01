import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initPermissionManager } from "../../src/services/permission_manager.ts";
import { ToolExecutor } from "../../src/services/tools.ts";

const buildConfig = (allowedTools: string[]) => `version: "1.0"
settings:
  default_deny: true
  log_denials: false
tools:
  allowed: ${JSON.stringify(allowedTools)}
skills:
  allowed: []
mcps:
  allowed: []
resources:
  denied_paths: []
`;

describe("tool roundtrip", () => {
  it("writes, reads, and lists files via tool executor", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-tool-"));
    const permissionsFile = join(dir, "permissions.yaml");
    await writeFile(permissionsFile, buildConfig(["write_file", "read_file", "list_directory"]));

    initPermissionManager(permissionsFile);
    const executor = new ToolExecutor();
    const filePath = join(dir, "note.txt");

    const writeResult = await executor.executeTool("write_file", { path: filePath, content: "hello" });
    expect(writeResult.success).toBe(true);

    const readResult = await executor.executeTool("read_file", { path: filePath });
    expect(readResult.success).toBe(true);
    expect(readResult.result).toBe("hello");

    const listResult = await executor.executeTool("list_directory", { path: dir });
    expect(listResult.success).toBe(true);
    expect(listResult.result).toEqual(
      expect.arrayContaining([
        { name: "note.txt", type: "file" },
        { name: "permissions.yaml", type: "file" }
      ])
    );

    await rm(dir, { recursive: true, force: true });
  });
});
