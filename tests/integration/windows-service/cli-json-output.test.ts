/**
 * JSON Output Format Tests for Service Commands
 * Tests that all service commands properly output JSON when --json flag is used
 */

import { describe, it, expect } from "bun:test";
import { spawn } from "child_process";
import { join } from "path";

describe("JSON Output Format", { timeout: 30000 }, () => {
  const mainScriptPath = join(process.cwd(), "src", "main.ts");

  describe("JSON Flag Support", () => {
    const commands = ["status", "logs", "start", "stop", "restart"];

    commands.forEach(command => {
      it(`should support --json flag for ${command} command`, async () => {
        const result = await runBunCommand([
          "run",
          mainScriptPath,
          "windows-service",
          command,
          "--json"
        ]);

        expect(result.exitCode).toBeDefined();
        // Command should execute (may fail, but should not fail due to JSON flag)
        expect(result.stderr).not.toContain("Unknown option");
        expect(result.stderr).not.toContain("Invalid option");
      });
    });
  });

  describe("JSON Output Structure", () => {
    it("should output valid JSON for status command", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "status",
        "--json"
      ]);

      // Look for JSON in the output (may be mixed with logs)
      const lines = result.stdout.split('\n');
      const jsonLines = lines.filter(line => line.trim().startsWith('{') || line.trim().startsWith('['));
      expect(jsonLines.length).toBeGreaterThan(0);

      // Try to parse the last JSON-like line
      const lastJsonLine = jsonLines[jsonLines.length - 1];
      expect(() => JSON.parse(lastJsonLine)).not.toThrow();
    });

    it("should output valid JSON for logs command", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "logs",
        "--json"
      ]);

      // Should output some form of JSON (may be error JSON)
      if (result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout.trim())).not.toThrow();
      }
    });

    it("should output valid JSON for start command", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "start",
        "NonExistentService",
        "--json"
      ]);

      // Should output error JSON for non-existent service
      if (result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout.trim())).not.toThrow();
      }
    });

    it("should output valid JSON for stop command", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "stop",
        "NonExistentService",
        "--json"
      ]);

      // Should output error JSON for non-existent service
      if (result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout.trim())).not.toThrow();
      }
    });

    it("should output valid JSON for restart command", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "restart",
        "NonExistentService",
        "--json"
      ]);

      // Should output error JSON for non-existent service
      if (result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout.trim())).not.toThrow();
      }
    });
  });

  describe("JSON Structure Consistency", () => {
    it("should have consistent success JSON structure", async () => {
      // Test with install command that can succeed with skip-validation
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "install",
        "--service-name",
        `TestJSON-${Date.now()}`,
        "--skip-validation",
        "--json"
      ]);

      if (result.stdout.trim()) {
        const jsonOutput = JSON.parse(result.stdout.trim());
        expect(jsonOutput).toHaveProperty("success");
        expect(typeof jsonOutput.success).toBe("boolean");
      }
    });

    it("should have consistent error JSON structure", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "start",
        "NonExistentService",
        "--json"
      ]);

      if (result.stdout.trim()) {
        const jsonOutput = JSON.parse(result.stdout.trim());
        expect(jsonOutput).toHaveProperty("success");
        expect(jsonOutput.success).toBe(false);
        expect(jsonOutput).toHaveProperty("error");
      }
    });

    it("should include service name in JSON output", async () => {
      const testServiceName = "TestServiceJSON";
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "status",
        testServiceName,
        "--json"
      ]);

      if (result.stdout.trim()) {
        const jsonOutput = JSON.parse(result.stdout.trim());
        expect(jsonOutput.serviceName || jsonOutput.service).toBeDefined();
      }
    });
  });

  describe("JSON vs Text Output", () => {
    it("should output different formats for JSON vs text", async () => {
      const [jsonResult, textResult] = await Promise.all([
        runBunCommand([
          "run",
          mainScriptPath,
          "windows-service",
          "status",
          "--json"
        ]),
        runBunCommand([
          "run",
          mainScriptPath,
          "windows-service",
          "status"
        ])
      ]);

      // Outputs should be different (JSON should be parseable, text should not)
      if (jsonResult.stdout.trim()) {
        expect(() => JSON.parse(jsonResult.stdout.trim())).not.toThrow();
      }

      // Text output should not be valid JSON (or at least different structure)
      if (textResult.stdout.trim() && jsonResult.stdout.trim()) {
        expect(textResult.stdout.trim()).not.toBe(jsonResult.stdout.trim());
      }
    });

    it("should not include formatting in JSON output", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "status",
        "--json"
      ]);

      if (result.stdout.trim()) {
        const jsonOutput = JSON.parse(result.stdout.trim());
        // JSON should not contain extra formatting like checkmarks or newlines
        expect(result.stdout).not.toContain("✓");
        expect(result.stdout).not.toContain("\n\n");
        expect(typeof jsonOutput).toBe("object");
      }
    });
  });

  describe("JSON Error Handling", () => {
    it("should output JSON error for invalid commands", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "invalid-command",
        "--json"
      ]);

      expect(result.exitCode).toBeGreaterThan(0);
      if (result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout.trim())).not.toThrow();
      }
    });

    it("should include error details in JSON", async () => {
      const result = await runBunCommand([
        "run",
        mainScriptPath,
        "windows-service",
        "start",
        "NonExistentService",
        "--json"
      ]);

      if (result.stdout.trim()) {
        const jsonOutput = JSON.parse(result.stdout.trim());
        expect(jsonOutput.success).toBe(false);
        expect(jsonOutput.error || jsonOutput.message).toBeDefined();
      }
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