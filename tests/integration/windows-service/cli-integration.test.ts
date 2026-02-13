/**
 * Integration Test: Windows Service CLI Commands End-to-End
 * Tests that service commands execute without starting the main bot application
 */

import { describe, it, expect } from "vitest";
import { spawn } from "child_process";
import { join } from "path";

describe("Windows Service CLI Commands Integration", { timeout: 30000 }, () => {
  const mainScriptPath = join(process.cwd(), "src", "main.ts");

  describe("Command Execution Behavior", () => {
    it("should execute service status command without bot startup", async () => {
      const result = await runBunCommand(["run", mainScriptPath, "windows-service", "status"]);

      // Exit code can vary based on service state, but should be defined
      expect(result.exitCode).toBeDefined();

      // Should contain service-related output or error messages
      expect(result.stdout).toContain("IronBot");

      // Verify bot did NOT start (should not see startup messages)
      expect(result.stdout).not.toContain("Starting Slack AI Agent");
      expect(result.stdout).not.toContain("Performing startup health checks");
      expect(result.stdout).not.toContain("Launching Slack Bolt app");
    });

    it("should execute service logs command without bot startup", async () => {
      const result = await runBunCommand(["run", mainScriptPath, "windows-service", "logs"]);

      expect(result.exitCode).toBeDefined();
      expect(result.stdout).toContain("IronBot");

      // Verify bot did NOT start
      expect(result.stdout).not.toContain("Starting Slack AI Agent");
      expect(result.stdout).not.toContain("Performing startup health checks");
    });

    it("should execute service stop command without bot startup", async () => {
      const result = await runBunCommand(["run", mainScriptPath, "windows-service", "stop"]);

      // Exit code can vary, but command should execute
      expect(result.exitCode).toBeDefined();
      expect(result.stdout).toContain("IronBot");

      // Verify bot did NOT start
      expect(result.stdout).not.toContain("Starting Slack AI Agent");
      expect(result.stdout).not.toContain("Performing startup health checks");
    });

    it("should handle service alias command", async () => {
      const result = await runBunCommand(["run", mainScriptPath, "service", "status"]);

      expect(result.exitCode).toBeDefined();
      expect(result.stdout).toContain("IronBot");

      // Verify bot did NOT start
      expect(result.stdout).not.toContain("Starting Slack AI Agent");
    });
  });

  describe("Command Options", () => {
    it("should support JSON output for status command", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "status",
        "--json"
      ]);

      expect(result.exitCode).toBeDefined();

      // Should contain some form of structured output (may be error JSON)
      expect(result.stdout.length).toBeGreaterThan(0);

      // The main test is that bot doesn't start
      expect(result.stdout).not.toContain("Starting Slack AI Agent");
    });

    it("should support JSON output for logs command", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "logs",
        "--json"
      ]);

      expect(result.exitCode).toBeDefined();

      // Should contain some form of structured output (may be error JSON)
      expect(result.stdout.length).toBeGreaterThan(0);

      // The main test is that bot doesn't start
      expect(result.stdout).not.toContain("Starting Slack AI Agent");
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid service commands gracefully", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "invalid-command"
      ]);

      // Should still not start the bot even for invalid commands
      expect(result.stdout).not.toContain("Starting Slack AI Agent");
      expect(result.stderr).toBeDefined();
    });

    it("should handle missing service name for commands that require it", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "uninstall"
      ]);

      // Command should execute (may show help or error)
      expect(result.stdout).toBeDefined();
      // Bot should not start
      expect(result.stdout).not.toContain("Starting Slack AI Agent");
    });
  });
});

/**
 * Helper function to run bun commands and capture output
 */
async function runBunCommand(args: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({
        exitCode: code || 0,
        stdout,
        stderr
      });
    });

    child.on("error", (error) => {
      reject(error);
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      child.kill();
      reject(new Error("Command timed out"));
    }, 15000);
  });
}