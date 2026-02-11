import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initPermissionManager } from "../../src/services/permission_manager.ts";
import { RetryManager } from "../../src/services/retry_manager.ts";
import { ToolExecutor } from "../../src/services/tools.ts";

vi.mock("node:child_process", () => ({
  spawn: vi.fn()
}));

// Import the mocked spawn after the mock is set up
import { spawn as spawnMock } from "node:child_process";

type PermissionOptions = {
  toolRules?: Array<{ priority: number; name: string; desc: string }>;
  resourceRules?: Array<{ priority: number; name: string; desc: string }>;
  commandRules?: Array<{ priority: number; name: string; desc: string }>;
};

const formatEntries = (entries: Array<{ priority: number; name: string; desc: string }>) =>
  JSON.stringify(entries ?? [], null, 2);

const buildConfig = (options: PermissionOptions = {}) => `tools: ${formatEntries(
  options.toolRules ?? []
)}
mcps: []
commands: ${formatEntries(
  options.commandRules ?? [{ priority: 0, name: ".*", desc: "allow all commands" }]
)}
skills: []
resurces: ${formatEntries(options.resourceRules ?? [])}
`;

const setupPermissions = async (options: PermissionOptions = {}) => {
  const dir = await mkdtemp(join(tmpdir(), "ironbot-tool-unit-"));
  const filePath = join(dir, "permissions.yaml");
  await writeFile(filePath, buildConfig(options));
  initPermissionManager(filePath);
  return { dir, filePath };
};

beforeEach(() => {
  spawnMock.mockImplementation(() => {
    const child = new EventEmitter() as unknown as {
      stdout?: EventEmitter;
      stderr?: EventEmitter;
      kill: () => void;
      on: (event: string, listener: (...args: unknown[]) => void) => void;
      emit: (event: string, ...args: unknown[]) => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    setImmediate(() => {
      child.emit("close", 0);
    });
    return child;
  });
});

afterEach(() => {
  spawnMock.mockReset();
  vi.clearAllMocks();
});

describe("ToolExecutor", () => {
  it("returns an error for unknown tools", async () => {
    const { dir } = await setupPermissions({ toolRules: [{ priority: 0, name: "read_.*", desc: "allow read" }] });
    const executor = new ToolExecutor();

    const result = await executor.executeTool("unknown_tool", {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("Permission denied: Tool 'unknown_tool'");

    await rm(dir, { recursive: true, force: true });
  });

  it("denies resource paths blocked by policy", async () => {
    const { dir } = await setupPermissions({
      toolRules: [{ priority: 0, name: "read_file", desc: "Allow read" }],
      resourceRules: [{ priority: 0, name: "/allowed/.*", desc: "allow allowed dir" }]
    });
    const executor = new ToolExecutor();

    const result = await executor.executeTool("read_file", { path: "/secret/notes.txt" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Permission denied: Resource path '/secret/notes.txt' is not allowed by policy");

    await rm(dir, { recursive: true, force: true });
  });

  it("allows commands that match the command policy", async () => {
    const { dir } = await setupPermissions({
      toolRules: [{ priority: 0, name: "run_bash", desc: "Allow bash" }],
      commandRules: [{ priority: 0, name: "^safe", desc: "Allow safe commands" }]
    });
    const executor = new ToolExecutor();

    const result = await executor.executeTool("run_bash", { command: "safe echo hello" });

    expect(result.success).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });

  it("denies commands outside the command policy", async () => {
    const { dir } = await setupPermissions({
      toolRules: [{ priority: 0, name: "run_bash", desc: "Allow bash" }],
      commandRules: [{ priority: 0, name: "^ls", desc: "Only allow ls" }]
    });
    const executor = new ToolExecutor();

    const result = await executor.executeTool("run_bash", { command: "rm -rf /" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Command blocked: This operation is not permitted by policy");

    await rm(dir, { recursive: true, force: true });
  });

  it("retries failing commands when retry manager is configured", async () => {
    const { dir } = await setupPermissions({ toolRules: [{ priority: 0, name: "run_bash", desc: "Allow bash" }] });
    const retryManager = new RetryManager({
      maxAttempts: 1,
      baseDelayMs: 1,
      maxDelayMs: 10,
      backoffMultiplier: 1,
      jitterMax: 0
    });
    const executor = new ToolExecutor(undefined, retryManager);

    let closeCount = 0;
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as unknown as {
        stdout?: EventEmitter;
        stderr?: EventEmitter;
        kill: () => void;
        on: (event: string, listener: (...args: unknown[]) => void) => void;
        emit: (event: string, ...args: unknown[]) => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      setImmediate(() => {
        const exitCode = closeCount === 0 ? 1 : 0;
        child.emit("close", exitCode);
        closeCount += 1;
      });
      return child;
    });

    const result = await executor.executeTool("run_bash", { command: "echo retry" });
    expect(closeCount).toBe(2);
    expect(result.success).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });
});
