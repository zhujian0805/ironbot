import { describe, expect, it, beforeEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initPermissionManager } from "../../src/services/permission_manager.ts";
import { ClaudeProcessor } from "../../src/services/claude_processor.ts";
import type { AppConfig } from "../../src/config.ts";

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

describe("hostname query validation", () => {
  let tempDir: string;
  let config: AppConfig;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ironbot-hostname-"));
    const permissionsFile = join(tempDir, "permissions.yaml");
    await writeFile(permissionsFile, buildConfig(["run_powershell"]));
    
    initPermissionManager(permissionsFile);
    
    config = {
      slackBotToken: "",
      slackAppToken: "",
      anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || "",
      anthropicAuthToken: process.env.ANTHROPIC_AUTH_TOKEN || "",
      anthropicModel: process.env.ANTHROPIC_MODEL || "grok-code-fast-1",
      skillsDir: "./skills",
      stateSkillsDir: join(tempDir, "state-skills"),
      skillDirs: ["./skills", join(tempDir, "state-skills")],
      permissionsFile,
      debug: false,
      logLevel: "ERROR",
      devMode: false,
      skipHealthChecks: true,
      sessions: {
        storePath: join(tempDir, "store.db"),
        transcriptsDir: join(tempDir, "transcripts"),
        dmSessionKey: "test-session",
        maxHistoryMessages: 12
      },
      memory: {
        workspaceDir: tempDir,
        sessionIndexing: false
      }
    } as AppConfig;
  });

  it("should execute hostname command and return CN-JZHU-WD", async () => {
    const processor = new ClaudeProcessor(config.skillDirs);
    
    const response = await processor.processMessage("告诉我主机名", {
      sessionKey: "test-session"
    });

    // The response should contain the actual hostname
    expect(response).toContain("CN-JZHU-WD");
    
    // Should NOT contain fake/example hostnames
    expect(response).not.toContain("DESKTOP-1234567");
    expect(response).not.toContain("DESKTOP-");
    
    await rm(tempDir, { recursive: true, force: true });
  }, 30000);

  it("should execute Get-Printer and return actual printers", async () => {
    const processor = new ClaudeProcessor(config.skillDirs);
    
    const response = await processor.processMessage("有多少打印机", {
      sessionKey: "test-session"
    });

    // Should contain actual printer count (not made-up data)
    // The AI might use different commands, so check for various formats
    expect(response).toMatch(/(Count\s*:\s*\d+|\d+)/);
    expect(response).toMatch(/\*\*\d+\*\*\s*(台|个)打印机|\d+\s*个打印机|系统中安装了\s*\*\*\d+\*\*\s*台打印机/);
    
    // Should NOT be a made-up response
    expect(response).not.toContain("假设");
    expect(response).not.toContain("example");
    
    await rm(tempDir, { recursive: true, force: true });
  }, 30000);
});
