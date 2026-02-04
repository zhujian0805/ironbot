import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PermissionManager } from "../../src/services/permission_manager.ts";

type ConfigOptions = {
  toolRules?: Array<{ priority: number; name: string; desc: string }>;
  resourceRules?: Array<{ priority: number; name: string; desc: string }>;
  commandRules?: Array<{ priority: number; name: string; desc: string }>;
  skillRules?: Array<{ priority: number; name: string; desc: string }>;
  mcpRules?: Array<{ priority: number; name: string; desc: string }>;
};

const defaultCommandRules = [{ priority: 0, name: ".*", desc: "allow all commands" }];

const formatSection = (entries: Array<{ priority: number; name: string; desc: string }>) =>
  JSON.stringify(entries ?? [], null, 2);

const buildConfig = (options: ConfigOptions = {}) => `tools: ${formatSection(
  options.toolRules ?? []
)}
mcps: ${formatSection(options.mcpRules ?? [])}
commands: ${formatSection(options.commandRules ?? defaultCommandRules)}
skills: ${formatSection(options.skillRules ?? [])}
resurces: ${formatSection(options.resourceRules ?? [])}
`;

describe("PermissionManager", () => {
  it("enforces allowed tool patterns", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-perm-unit-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(
      filePath,
      buildConfig({
        toolRules: [{ priority: 0, name: "read_.*", desc: "Allow read tools" }]
      })
    );

    const manager = new PermissionManager(filePath);
    manager.loadConfig();

    expect(manager.isToolAllowed("read_file")).toBe(true);
    expect(manager.isToolAllowed("write_file")).toBe(false);

    await rm(dir, { recursive: true, force: true });
  });

  it("denies resource paths outside the allowed list", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-perm-unit-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(
      filePath,
      buildConfig({
        toolRules: [{ priority: 0, name: "read_file", desc: "Allow read file" }],
        resourceRules: [
          { priority: 0, name: "/home/.*", desc: "Allow home directory" },
          { priority: 1, name: "C:\\\\Users\\\\.*", desc: "Allow user folder" }
        ]
      })
    );

    const manager = new PermissionManager(filePath);
    manager.loadConfig();

    expect(manager.isResourceAllowed("C:\\Windows\\System32")).toBe(false);
    expect(manager.isResourceAllowed("/etc/passwd")).toBe(false);
    expect(manager.isResourceAllowed("/home/user")).toBe(true);

    const decision = manager.checkPermission("tool", "read_file", "/etc/passwd");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("not in the allowed rules");

    await rm(dir, { recursive: true, force: true });
  });

  it("supports wildcard tool patterns", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-perm-unit-"));
    const filePath = join(dir, "permissions.yaml");
    await writeFile(
      filePath,
      buildConfig({
    toolRules: [
      { priority: 0, name: "^read_file$", desc: "Allow read_file only" },
      { priority: 1, name: "^write_.*$", desc: "Allow write tools" }
    ]
      })
    );

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
