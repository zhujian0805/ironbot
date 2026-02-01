import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PermissionManager } from "../../src/services/permission_manager.ts";

const buildConfig = (options: {
  allowedTools: string[];
  deniedPaths?: string[];
}) => `version: "1.0"
settings:
  default_deny: true
  log_denials: false
tools:
  allowed: ${JSON.stringify(options.allowedTools)}
skills:
  allowed: []
mcps:
  allowed: []
resources:
  denied_paths: ${JSON.stringify(options.deniedPaths ?? [])}
`;

describe("PermissionManager", () => {
  it("enforces allowed tool patterns", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-perm-unit-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(filePath, buildConfig({ allowedTools: ["read_*"] }));

    const manager = new PermissionManager(filePath);
    manager.loadConfig();

    expect(manager.isToolAllowed("read_file")).toBe(true);
    expect(manager.isToolAllowed("write_file")).toBe(false);

    await rm(dir, { recursive: true, force: true });
  });

  it("denies resource paths matching deny rules", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-perm-unit-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(
      filePath,
      buildConfig({
        allowedTools: ["read_file"],
        deniedPaths: ["C:\\Windows\\*", "/etc/*"]
      })
    );

    const manager = new PermissionManager(filePath);
    manager.loadConfig();

    expect(manager.checkResourceDenied("C:\\Windows\\System32")).toBe(true);
    expect(manager.checkResourceDenied("/etc/passwd")).toBe(true);
    expect(manager.checkResourceDenied("/home/user")).toBe(false);

    const decision = manager.checkPermission("tool", "read_file", "C:\\Windows\\System32");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("denied");

    await rm(dir, { recursive: true, force: true });
  });

  it("supports wildcard tool patterns", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-perm-unit-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(filePath, buildConfig({ allowedTools: ["read_??le", "write_*"] }));

    const manager = new PermissionManager(filePath);
    manager.loadConfig();

    expect(manager.isToolAllowed("read_file")).toBe(true);
    expect(manager.isToolAllowed("write_notes")).toBe(true);
    expect(manager.isToolAllowed("read_files")).toBe(false);

    await rm(dir, { recursive: true, force: true });
  });

  it("defaults to deny when the config file is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-perm-unit-"));
    const filePath = join(dir, "missing.yaml");

    const manager = new PermissionManager(filePath);
    const loaded = manager.loadConfig();

    expect(loaded).toBe(false);
    expect(manager.isToolAllowed("read_file")).toBe(false);

    await rm(dir, { recursive: true, force: true });
  });

  it("defaults to deny when the config file is empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-perm-unit-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(filePath, "");

    const manager = new PermissionManager(filePath);
    const loaded = manager.loadConfig();

    expect(loaded).toBe(false);
    expect(manager.isToolAllowed("read_file")).toBe(false);

    await rm(dir, { recursive: true, force: true });
  });
});
