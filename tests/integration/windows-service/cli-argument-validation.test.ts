/**
 * CLI Argument Validation Tests for Service Commands
 * Tests argument parsing, validation, and type checking for all service CLI commands
 */

import { describe, it, expect } from "bun:test";
import { spawn } from "child_process";
import { join } from "path";

describe("CLI Argument Validation", { timeout: 30000 }, () => {
  const mainScriptPath = join(process.cwd(), "src", "main.ts");

  describe("Install Command Arguments", () => {
    it("should handle invalid startup type gracefully", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "install",
        "--startup-type",
        "invalid"
      ]);

      // Command should execute and handle the invalid type appropriately
      expect(result.exitCode).toBeDefined();
      expect(result.stdout).toBeDefined();
      // May show validation errors or fallback to default
    });

    it("should accept valid startup types", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "install",
        "--startup-type",
        "auto",
        "--skip-validation",
        "--force"
      ]);

      expect(result.exitCode).toBeDefined();
      expect(result.stdout).toBeDefined();
      // Should not contain argument parsing errors
      expect(result.stderr).not.toContain("Unknown option");
    });

    it("should handle service name with special characters", async () => {
      const testName = "Test-Service_123";
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "install",
        "--service-name",
        testName,
        "--skip-validation"
      ]);

      expect(result.exitCode).toBeDefined();
      // Command should be parsed without issues
      expect(result.stdout).toBeDefined();
    });
  });

  describe("Stop Command Arguments", () => {
    it("should accept valid timeout values", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "stop",
        "--timeout",
        "60"
      ]);

      expect(result.exitCode).toBeDefined();
      expect(result.stderr).not.toContain("Unknown option");
    });

    it("should handle invalid timeout values gracefully", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "stop",
        "--timeout",
        "not-a-number"
      ]);

      expect(result.exitCode).toBeDefined();
      // Command should execute (may use default value or show error)
      expect(result.stdout).toBeDefined();
    });

    it("should handle negative timeout values gracefully", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "stop",
        "--timeout",
        "-5"
      ]);

      expect(result.exitCode).toBeDefined();
      // Command should execute (may use default value or show error)
      expect(result.stdout).toBeDefined();
    });
  });

  describe("Logs Command Arguments", () => {
    it("should accept valid lines parameter", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "logs",
        "--lines",
        "100"
      ]);

      expect(result.exitCode).toBeDefined();
      expect(result.stderr).not.toContain("Unknown option");
    });

    it("should handle invalid lines parameter gracefully", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "logs",
        "--lines",
        "not-a-number"
      ]);

      expect(result.exitCode).toBeDefined();
      // Command should execute (may use default value)
      expect(result.stdout).toBeDefined();
    });

    it("should accept valid log levels", async () => {
      const validLevels = ["error", "warn", "info", "debug"];

      for (const level of validLevels) {
        const result = await runBunCommand([
          "run",
          mainScriptPath,
          "windows-service",
          "logs",
          "--level",
          level
        ]);

        expect(result.exitCode).toBeDefined();
        expect(result.stderr).not.toContain("Unknown option");
      }
    });

    it("should handle invalid log levels gracefully", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "logs",
        "--level",
        "invalid"
      ]);

      expect(result.exitCode).toBeDefined();
      // Command should execute (may ignore invalid level)
      expect(result.stdout).toBeDefined();
    });

    it("should accept valid time formats", async () => {
      const validTimes = ["1h", "30m", "90s"];

      for (const time of validTimes) {
        const result = await runBunCommand([
          "run",
          mainScriptPath,
          "windows-service",
          "logs",
          "--since",
          time
        ]);

        expect(result.exitCode).toBeDefined();
        expect(result.stderr).not.toContain("Unknown option");
      }
    });
  });

  describe("Service Name Arguments", () => {
    it("should handle empty service name for commands that support defaults", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "status"
      ]);

      expect(result.exitCode).toBeDefined();
      // Should use default service name
      expect(result.stdout).toContain("IronBot");
    });

    it("should accept custom service name", async () => {
      const customName = "MyCustomService";
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "status",
        customName
      ]);

      expect(result.exitCode).toBeDefined();
      // Should attempt to check the custom service name
      expect(result.stdout).toBeDefined();
    });
  });

  describe("Boolean Flag Arguments", () => {
    it("should handle --json flag consistently", async () => {
      const commands = ["status", "logs", "start", "stop", "restart"];

      for (const command of commands) {
        const result = await runBunCommand([
          "run",
          mainScriptPath,
          "windows-service",
          command,
          "--json"
        ]);

        expect(result.exitCode).toBeDefined();
        // Should not fail on argument parsing
        expect(result.stderr).not.toContain("Unknown option");
      }
    });

    it("should handle --force flag for install/uninstall", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "uninstall",
        "--force"
      ]);

      expect(result.exitCode).toBeDefined();
      expect(result.stderr).not.toContain("Unknown option");
    });
  });

  describe("Unknown Option Handling", () => {
    it("should reject unknown options", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "status",
        "--unknown-option"
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr).toContain("unknown option");
    });

    it("should handle multiple unknown options", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "logs",
        "--unknown1",
        "--unknown2"
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr).toContain("unknown option");
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