import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { initPermissionManager } from "../../src/services/permission_manager.ts";
import { ToolExecutor } from "../../src/services/tools.ts";
import { RetryManager } from "../../src/services/retry_manager.ts";

vi.mock("node:child_process", () => ({
  spawn: vi.fn()
}));

const spawnMock = vi.mocked(spawn);

type PermissionOptions = {
  allowedTools: string[];
  deniedPaths?: string[];
  restrictions?: Record<string, unknown>;
};

const buildConfig = (options: PermissionOptions) => `version: "1.0"
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

const setupPermissions = async (options: PermissionOptions) => {
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
    const { dir } = await setupPermissions({ allowedTools: ["*"] });
    const executor = new ToolExecutor();

    const result = await executor.executeTool("unknown_tool", {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unknown tool: unknown_tool");

    await rm(dir, { recursive: true, force: true });
  });

  it("denies resource paths blocked by permissions", async () => {
    const { dir } = await setupPermissions({
      allowedTools: ["read_file"],
      deniedPaths: ["/secret/*"]
    });
    const executor = new ToolExecutor();

    const result = await executor.executeTool("read_file", { path: "/secret/notes.txt" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Permission denied: Resource path '/secret/notes.txt'");

    await rm(dir, { recursive: true, force: true });
  });

  it("allows potentially unsafe commands when not blocked", async () => {
    const { dir } = await setupPermissions({ allowedTools: ["run_bash"] });
    const executor = new ToolExecutor();

    const result = await executor.executeTool("run_bash", { command: "rm -rf /" });

    expect(result.success).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });

  it("enforces allowed_commands restrictions", async () => {
    const { dir } = await setupPermissions({
      allowedTools: ["run_bash"],
      restrictions: {
        run_bash: {
          allowed_commands: ["echo *"]
        }
      }
    });
    const executor = new ToolExecutor();

    const result = await executor.executeTool("run_bash", { command: "ls" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Permission denied: Command 'ls' is not in allowed_commands list");

    await rm(dir, { recursive: true, force: true });
  });

  it("allows commands when wildcard '*' is configured", async () => {
    const { dir } = await setupPermissions({
      allowedTools: ["run_bash"],
      restrictions: {
        run_bash: {
          allowed_commands: ["*"]
        }
      }
    });
    const executor = new ToolExecutor();

    const result = await executor.executeTool("run_bash", { command: "ls -la /tmp" });

    expect(result.success).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });

  it("enforces blocked_commands restrictions", async () => {
    const { dir } = await setupPermissions({
      allowedTools: ["run_bash"],
      restrictions: {
        run_bash: {
          allowed_commands: ["*"],
          blocked_commands: ["rm *"]
        }
      }
    });
    const executor = new ToolExecutor();

    const result = await executor.executeTool("run_bash", { command: "rm -rf /tmp" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Permission denied: Command 'rm -rf /tmp' is blocked by rule 'rm *'");

    await rm(dir, { recursive: true, force: true });
  });

  it("enforces allowed_paths restrictions", async () => {
    const { dir } = await setupPermissions({
      allowedTools: ["run_bash"],
      restrictions: {
        run_bash: {
          allowed_commands: ["*"],
          allowed_paths: ["/allowed/*"]
        }
      }
    });
    const executor = new ToolExecutor();

    const result = await executor.executeTool("run_bash", {
      command: "echo ok",
      working_directory: "/blocked"
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Permission denied: Resource path '/blocked' is not in allowed_paths list (allowed: /allowed/*)");

    await rm(dir, { recursive: true, force: true });
  });

  it("clamps timeouts to restriction maximums", async () => {
    const { dir } = await setupPermissions({
      allowedTools: ["run_bash"],
      restrictions: {
        run_bash: {
          allowed_commands: ["echo *"],
          timeout_max: 1
        }
      }
    });
    const executor = new ToolExecutor();
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    const result = await executor.executeTool("run_bash", { command: "echo hello", timeout: 10 });

    expect(result.success).toBe(true);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);

    setTimeoutSpy.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  it("retries failing commands when retry manager is configured", async () => {
    const { dir } = await setupPermissions({ allowedTools: ["run_bash"] });
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
