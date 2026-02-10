import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initPermissionManager } from "../../src/services/permission_manager.ts";
import { ToolExecutor } from "../../src/services/tools.ts";

const buildConfig = (allowedTools: string[]) => `tools: ${JSON.stringify(
  allowedTools.map((name, index) => ({
    priority: index,
    name,
    desc: `Allow ${name}`
  })),
  null,
  2
)}
mcps: []
commands: ${JSON.stringify([{ priority: 0, name: ".*", desc: "Allow all commands" }], null, 2)}
skills: []
resurces: ${JSON.stringify([{ priority: 0, name: ".*", desc: "Allow all resources" }], null, 2)}
`;

describe("powershell tool execution on host", () => {
  it("executes Get-Printer and returns host printers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-powershell-"));
    const permissionsFile = join(dir, "permissions.yaml");
    await writeFile(permissionsFile, buildConfig(["run_powershell"]));

    initPermissionManager(permissionsFile);
    const executor = new ToolExecutor();

    const result = await executor.executeTool("run_powershell", { command: "Get-Printer | Select-Object -ExpandProperty Name" });
    expect(result.success).toBe(true);
    expect(typeof result.result).toBe("string");
    expect(result.result).toContain("Microsoft Print to PDF"); // Common printer that should exist

    await rm(dir, { recursive: true, force: true });
  });

  it("executes Get-Volume and returns host volumes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-powershell-"));
    const permissionsFile = join(dir, "permissions.yaml");
    await writeFile(permissionsFile, buildConfig(["run_powershell"]));

    initPermissionManager(permissionsFile);
    const executor = new ToolExecutor();

    const result = await executor.executeTool("run_powershell", { command: "Get-Volume | Where-Object { $_.DriveLetter } | Select-Object -ExpandProperty DriveLetter" });
    expect(result.success).toBe(true);
    expect(typeof result.result).toBe("string");
    expect(result.result).toContain("C"); // Should have C drive

    await rm(dir, { recursive: true, force: true });
  });

  it("executes PowerShell script file with -ExecutionPolicy Bypass -File", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-powershell-"));
    const permissionsFile = join(dir, "permissions.yaml");
    await writeFile(permissionsFile, buildConfig(["run_powershell"]));

    initPermissionManager(permissionsFile);
    const executor = new ToolExecutor();

    const result = await executor.executeTool("run_powershell", { command: join(process.cwd(), "test_script.ps1") });
    expect(result.success).toBe(true);
    expect(typeof result.result).toBe("string");
    expect(result.result).toContain("Hello from test script!");

    await rm(dir, { recursive: true, force: true });
  });
});
