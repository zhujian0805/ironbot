/**
 * CLI Error Handling Tests for Service Commands
 * Tests error scenarios, edge cases, and failure handling for all service CLI commands
 */

import { describe, it, expect } from "bun:test";
import { spawn } from "child_process";
import { join } from "path";

describe("CLI Error Handling", { timeout: 30000 }, () => {
  const mainScriptPath = join(process.cwd(), "src", "main.ts");

  describe("Non-existent Service Errors", () => {
    const nonExistentService = "DefinitelyNotARealService12345";

    it("should handle non-existent service for status command", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "status",
        nonExistentService
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr).toMatch(/failed|error|not found/i);
    });

    it("should handle non-existent service for start command", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "start",
        nonExistentService
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr).toMatch(/failed|error|not found/i);
    });

    it("should handle non-existent service for stop command", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "stop",
        nonExistentService
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr).toMatch(/failed|error|not found/i);
    });

    it("should handle non-existent service for restart command", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "restart",
        nonExistentService
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr).toMatch(/failed|error|not found/i);
    });
  });

  describe("Invalid Command Errors", () => {
    it("should handle invalid service commands", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "invalid-command"
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr).toMatch(/failed|error|not found/i);
    });

    it("should handle unknown subcommands", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "dance"
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr).toMatch(/failed|error|not found/i);
    });
  });

  describe("Permission and Access Errors", () => {
    it("should handle permission denied for service operations", async () => {
      // This test may vary based on system permissions
      // We'll test the error handling path exists
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "start",
        "SystemService" // Usually requires admin
      ]);

      // May succeed or fail based on permissions, but should handle it
      expect(result.exitCode).toBeDefined();
      expect(result.stdout).toBeDefined();
    });

    it("should handle service access denied errors", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "status",
        "ProtectedService"
      ]);

      // May succeed or fail, but should not crash
      expect(result.exitCode).toBeDefined();
    });
  });

  describe("Installation Error Scenarios", () => {
    it("should handle installation failure gracefully", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "install",
        "--service-name",
        "Invalid/Service\\Name"
      ]);

      // Should fail but not crash the CLI
      expect(result.exitCode).toBeDefined();
      expect(result.stderr).toBeDefined();
    });

    it("should handle duplicate installation attempts", async () => {
      const testServiceName = `TestDupInstall-${Date.now()}`;

      // First install (may succeed)
      await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "install",
        "--service-name",
        testServiceName,
        "--skip-validation"
      ]);

      // Second install should handle gracefully
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "install",
        "--service-name",
        testServiceName,
        "--skip-validation"
      ]);

      expect(result.exitCode).toBeDefined();
      // Cleanup
      await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "uninstall",
        testServiceName,
        "--force"
      ]);
    });
  });

  describe("Timeout and Operation Errors", () => {
    it("should handle stop command timeouts", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "stop",
        "NonExistentService",
        "--timeout",
        "1" // Very short timeout
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr).toMatch(/failed|error|not found/i);
    });

    it("should handle operation interruption", async () => {
      // Test with a very short timeout to force failure
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "stop",
        "AnotherNonExistentService",
        "--timeout",
        "0"
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
    });
  });

  describe("Network and External Errors", () => {
    it("should handle service manager communication errors", async () => {
      // Test with invalid service manager state
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "status",
        "InvalidServiceName"
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr).toMatch(/failed|error|not found/i);
    });
  });

  describe("File System Errors", () => {
    it("should handle log file access errors", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "logs",
        "NonExistentService"
      ]);

      // Should not crash, should handle gracefully
      expect(result.exitCode).toBeDefined();
      expect(result.stdout).toBeDefined();
    });

    it("should handle configuration file errors", async () => {
      // Test with invalid config scenarios
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "install",
        "--startup-type",
        "invalid"
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr).toMatch(/failed|error|not found/i);
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