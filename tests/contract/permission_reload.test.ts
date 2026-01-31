import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PermissionManager } from "../../src/services/permission_manager.js";

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 1500,
  intervalMs = 50
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for condition");
};

const baseConfig = (tools: string[]) => `version: "1.0"
settings:
  default_deny: true
  log_denials: false
tools:
  allowed: ${JSON.stringify(tools)}
skills:
  allowed: []
mcps:
  allowed: []
resources:
  denied_paths: []
`;

describe("Permission config hot reload", () => {
  it("reloads config when the permissions file changes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ironbot-permissions-"));
    const filePath = join(dir, "permissions.yaml");

    await writeFile(filePath, baseConfig(["read_file"]));

    const manager = new PermissionManager(filePath);
    manager.loadConfig();
    manager.startFileWatcher();

    expect(manager.isToolAllowed("read_file")).toBe(true);
    expect(manager.isToolAllowed("write_file")).toBe(false);

    await writeFile(filePath, baseConfig(["write_file"]));

    await waitFor(() => manager.isToolAllowed("write_file"));

    manager.stopFileWatcher();
    await rm(dir, { recursive: true, force: true });
  });
});
