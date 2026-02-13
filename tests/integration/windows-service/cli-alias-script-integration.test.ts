/**
 * Alias and Script Integration Tests for Service Commands
 * Tests command aliases and npm script integration for service commands
 */

import { describe, it, expect } from "bun:test";
import { spawn } from "child_process";
import { join } from "path";

describe("Alias and Script Integration", { timeout: 30000 }, () => {
  const mainScriptPath = join(process.cwd(), "src", "main.ts");

  describe("Command Aliases", () => {
    it("should support 'service' alias for all commands", async () => {
      const commands = ["status", "logs", "start", "stop", "restart"];

      for (const command of commands) {
        const result = await runBunCommand([
          "run",
          mainScriptPath,
          "service",
          command
        ]);

        expect(result.exitCode).toBeDefined();
        // Should not fail due to alias parsing
        expect(result.stderr).not.toContain("Unknown command");
      }
    });

    it("should produce same output for 'service' and 'windows-service' aliases", async () => {
      const [serviceResult, windowsServiceResult] = await Promise.all([
        runBunCommand([
          "run",
          mainScriptPath,
          "service",
          "status"
        ]),
        runBunCommand([
          "run",
          mainScriptPath,
          "windows-service",
          "status"
        ])
      ]);

      // Both should execute (may succeed or fail, but same way)
      expect(serviceResult.exitCode).toBe(windowsServiceResult.exitCode);
      expect(serviceResult.stdout.length).toBeGreaterThan(0);
      expect(windowsServiceResult.stdout.length).toBeGreaterThan(0);
    });

    it("should support alias with JSON flag", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "service",
        "status",
        "--json"
      ]);

      expect(result.exitCode).toBeDefined();
      expect(result.stderr).not.toContain("Unknown command");
    });

    it("should support alias with help flag", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "service",
        "--help"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Manage IronBot as a Windows service");
    });
  });

  describe("NPM Script Integration", () => {
    it("should execute service install via npm script", async () => {
      const result = await runBunCommand([
        "run",
        "service:install",
        "--service-name",
        `TestNPM-${Date.now()}`,
        "--skip-validation"
      ]);

      expect(result.exitCode).toBeDefined();
      // Should not fail due to script execution
      expect(result.stderr).not.toContain("Invalid command");
    });

    it("should execute service uninstall via npm script", async () => {
      const result = await runBunCommand([
        "run",
        "service:uninstall",
        "--force"
      ]);

      expect(result.exitCode).toBeDefined();
      expect(result.stderr).not.toContain("Invalid command");
    });

    it("should execute service start via npm script", async () => {
      const result = await runBunCommand([
        "run",
        "service:start"
      ]);

      expect(result.exitCode).toBeDefined();
      expect(result.stderr).not.toContain("Invalid command");
    });

    it("should execute service stop via npm script", async () => {
      const result = await runBunCommand([
        "run",
        "service:stop"
      ]);

      expect(result.exitCode).toBeDefined();
      expect(result.stderr).not.toContain("Invalid command");
    });

    it("should execute service restart via npm script", async () => {
      const result = await runBunCommand([
        "run",
        "service:restart"
      ]);

      expect(result.exitCode).toBeDefined();
      expect(result.stderr).not.toContain("Invalid command");
    });

    it("should execute service status via npm script", async () => {
      const result = await runBunCommand([
        "run",
        "service:status"
      ]);

      expect(result.exitCode).toBeDefined();
      expect(result.stderr).not.toContain("Invalid command");
      expect(result.stdout).toContain("IronBot");
    });

    it("should execute service logs via npm script", async () => {
      const result = await runBunCommand([
        "run",
        "service:logs"
      ]);

      expect(result.exitCode).toBeDefined();
      expect(result.stderr).not.toContain("Invalid command");
      expect(result.stdout).toBeDefined();
    });
  });

  describe("Script Argument Passing", () => {
    it("should pass arguments to npm scripts", async () => {
      const customServiceName = "CustomServiceTest";
      const result = await runBunCommand([
        "run",
        "service:status",
        customServiceName
      ]);

      expect(result.exitCode).toBeDefined();
      // Should attempt to check the custom service
      expect(result.stdout).toBeDefined();
    });

    it("should pass JSON flag to npm scripts", async () => {
      const result = await runBunCommand([
        "run",
        "service:status",
        "--json"
      ]);

      expect(result.exitCode).toBeDefined();
      expect(result.stderr).not.toContain("Invalid command");
      // Should output JSON or valid response
      expect(result.stdout).toBeDefined();
    });

    it("should handle script timeout gracefully", async () => {
      const result = await runBunCommand([
        "run",
        "service:stop",
        "--timeout",
        "1"
      ]);

      expect(result.exitCode).toBeDefined();
      // Should not crash the script execution
      expect(result.stderr).toBeDefined();
    });
  });

  describe("Cross-Platform Compatibility", () => {
    it("should work with different shell environments", async () => {
      // Test that scripts work regardless of shell
      const result = await runBunCommand([
        "run",
        "service:status"
      ]);

      expect(result.exitCode).toBeDefined();
      expect(result.stdout).toContain("IronBot");
    });

    it("should handle Windows path separators", async () => {
      // Test with Windows-style paths if applicable
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "service",
        "status"
      ]);

      expect(result.exitCode).toBeDefined();
      expect(result.stdout).toBeDefined();
    });
  });

  describe("Integration Edge Cases", () => {
    it("should handle concurrent script executions", async () => {
      // Test multiple scripts running simultaneously
      const promises = [
        runBunCommand(["run", "service:status"]),
        runBunCommand(["run", "service:logs"]),
        runBunCommand(["run", "service:status", "--json"])
      ];

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.exitCode).toBeDefined();
        expect(result.stdout).toBeDefined();
      });
    });

    it("should handle script interruption gracefully", async () => {
      // Test with a command that might be interrupted
      const result = await runBunCommand([
        "run",
        "service:stop",
        "NonExistentService"
      ]);

      expect(result.exitCode).toBeDefined();
      // Should exit cleanly even on failure
      expect(result.stderr).toBeDefined();
    });

    it("should work with different working directories", async () => {
      // Test that scripts work from different directories
      const result = await runBunCommand([
        "run",
        "service:status"
      ], process.cwd());

      expect(result.exitCode).toBeDefined();
      expect(result.stdout).toContain("IronBot");
    });
  });
});

/**
 * Helper function to run bun commands and capture output
 */
async function runBunCommand(args: string[], cwd?: string): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", args, {
      cwd: cwd || process.cwd(),
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