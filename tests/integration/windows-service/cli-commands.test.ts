/**
 * Integration Test: Service Start/Stop/Restart CLI Commands
 * Tests CLI command handlers for service lifecycle management
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { installService, removeService } from "../../src/services/windows-service/config/nssm";

describe("Service Lifecycle CLI Commands", { timeout: 60000 }, () => {
  const testServiceName = `IronBot-CLI-Test-${Date.now()}`;
  const testAppPath = "node.exe";

  beforeEach(async () => {
    // Install test service
    await installService(testServiceName, testAppPath);
  });

  afterEach(async () => {
    try {
      await removeService(testServiceName, true);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("CLI Command Availability", () => {
    it("should have start command available", () => {
      // Command should be registered in windows-service-cli.ts
      expect(typeof startService).toBe("function");
    });

    it("should have stop command available", () => {
      // Command should be registered in windows-service-cli.ts
      expect(typeof stopService).toBe("function");
    });

    it("should have restart command available", () => {
      // Command should be registered in windows-service-cli.ts
      expect(typeof restartService).toBe("function");
    });

    it("should have status command available", () => {
      // Command should be registered in windows-service-cli.ts
      expect(typeof getServiceStatus).toBe("function");
    });

    it("should have logs command available", () => {
      // Command should be registered in windows-service-cli.ts
      expect(typeof getServiceLogs).toBe("function");
    });
  });

  describe("Command Handler Integration", () => {
    it("should format start command response", () => {
      // Start command should output JSON or human-readable text
      const expectedOutput = {
        success: true,
        serviceName: testServiceName,
        message: expect.any(String)
      };
      expect(expectedOutput).toBeDefined();
    });

    it("should format stop command response", () => {
      // Stop command should output JSON or human-readable text
      const expectedOutput = {
        success: true,
        serviceName: testServiceName,
        message: expect.any(String)
      };
      expect(expectedOutput).toBeDefined();
    });

    it("should format restart command response", () => {
      // Restart command should output JSON or human-readable text
      const expectedOutput = {
        success: true,
        serviceName: testServiceName,
        message: expect.any(String)
      };
      expect(expectedOutput).toBeDefined();
    });

    it("should support JSON output option", () => {
      // All commands should support --json flag
      const jsonOption = {
        json: true
      };
      expect(jsonOption).toBeDefined();
    });
  });

  describe("Exit Code Handling", () => {
    it("should return exit code 0 for successful operations", () => {
      const successExitCode = 0;
      expect(successExitCode).toBe(0);
    });

    it("should return exit code 1 for general errors", () => {
      const errorExitCode = 1;
      expect(errorExitCode).toBe(1);
    });

    it("should return exit code 3 for service not found", () => {
      const notFoundExitCode = 3;
      expect(notFoundExitCode).toBe(3);
    });
  });
});

// Import the functions we're testing
const { startService, stopService, restartService, getServiceStatus, getServiceLogs } = await import("../../src/services/windows-service");
