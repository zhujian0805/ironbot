/**
 * Help and Usage Tests for Service Commands
 * Tests help output, command discovery, and usage information for service CLI
 */

import { describe, it, expect } from "bun:test";
import { spawn } from "child_process";
import { join } from "path";

describe("Help and Usage", { timeout: 30000 }, () => {
  const mainScriptPath = join(process.cwd(), "src", "main.ts");

  describe("Main Help Output", () => {
    it("should display main help when no command given", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service"
      ]);

      expect(result.exitCode).toBeDefined(); // May be 1 due to no subcommand
      expect(result.stdout).toContain("Manage IronBot as a Windows service");
      expect(result.stdout).toContain("install");
      expect(result.stdout).toContain("uninstall");
      expect(result.stdout).toContain("start");
      expect(result.stdout).toContain("stop");
      expect(result.stdout).toContain("restart");
      expect(result.stdout).toContain("status");
      expect(result.stdout).toContain("logs");
    });

    it("should display help with --help flag", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "--help"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Manage IronBot as a Windows service");
      expect(result.stdout).toContain("Commands:");
    });

    it("should display help with -h flag", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "-h"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Manage IronBot as a Windows service");
    });
  });

  describe("Command-Specific Help", () => {
    it("should display install command help", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "install",
        "--help"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Install IronBot as a Windows service");
      expect(result.stdout).toContain("--service-name");
      expect(result.stdout).toContain("--startup-type");
      expect(result.stdout).toContain("--force");
      expect(result.stdout).toContain("--json");
    });

    it("should display uninstall command help", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "uninstall",
        "--help"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Uninstall IronBot service");
      expect(result.stdout).toContain("--force");
      expect(result.stdout).toContain("--json");
    });

    it("should display start command help", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "start",
        "--help"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Start IronBot service");
      expect(result.stdout).toContain("--json");
    });

    it("should display stop command help", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "stop",
        "--help"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Stop IronBot service");
      expect(result.stdout).toContain("--timeout");
      expect(result.stdout).toContain("--json");
    });

    it("should display restart command help", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "restart",
        "--help"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Restart IronBot service");
      expect(result.stdout).toContain("--json");
    });

    it("should display status command help", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "status",
        "--help"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Check IronBot service status");
      expect(result.stdout).toContain("--json");
    });

    it("should display logs command help", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "logs",
        "--help"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("View service logs");
      expect(result.stdout).toContain("--lines");
      expect(result.stdout).toContain("--follow");
      expect(result.stdout).toContain("--since");
      expect(result.stdout).toContain("--level");
      expect(result.stdout).toContain("--json");
    });
  });

  describe("Usage Information", () => {
    it("should show usage examples in help", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "--help"
      ]);

      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toMatch(/windows-service|service/);
    });

    it("should show command usage in individual help", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "install",
        "--help"
      ]);

      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toMatch(/install/);
    });
  });

  describe("Option Descriptions", () => {
    it("should show detailed option descriptions", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "install",
        "--help"
      ]);

      expect(result.stdout).toContain("Options:");
      expect(result.stdout).toContain("Service name");
      expect(result.stdout).toContain("Startup type");
    });

    it("should show option types and defaults", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "stop",
        "--help"
      ]);

      expect(result.stdout).toContain("timeout");
      expect(result.stdout).toContain("seconds");
      expect(result.stdout).toContain("default:");
    });
  });

  describe("Alias Support", () => {
    it("should support service alias for help", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "service",
        "--help"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Manage IronBot as a Windows service");
    });

    it("should support service alias for command help", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "service",
        "status",
        "--help"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Check IronBot service status");
    });
  });

  describe("Error Help", () => {
    it("should show help when invalid command is used", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "invalid-command"
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
      // Should show some form of help or error message
      expect(result.stderr).toContain("error");
    });

    it("should show help with unknown options", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "--unknown-option"
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr).toContain("error");
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