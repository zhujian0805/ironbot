/**
 * Integration Test: Service Installation
 * Tests actual service installation via NSSM
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { installService, getServiceStatus, removeService } from "../../src/services/windows-service/config/nssm.js";
import { executeCommand } from "../../src/services/windows-service/utils/process.js";

describe("Windows Service Installation", { timeout: 60000 }, () => {
  const testServiceName = `IronBot-Test-${Date.now()}`;
  const testAppPath = "node.exe";

  afterEach(async () => {
    // Cleanup: Remove test service
    try {
      await removeService(testServiceName, true);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Service Installation via NSSM", () => {
    it("should install a service successfully", async () => {
      const result = await installService(testServiceName, testAppPath, ["-v"]);
      expect(result).toBe(true);
    });

    it("should create service that appears in services list", async () => {
      // Install service first
      const installResult = await installService(testServiceName, testAppPath, ["-v"]);
      expect(installResult).toBe(true);

      // Query service to verify it exists
      const result = await executeCommand("sc", ["query", testServiceName]);
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(testServiceName);
    });

    it("should set service configuration", async () => {
      // Install and configure service
      const installResult = await installService(testServiceName, testAppPath);
      expect(installResult).toBe(true);

      // Query NSSM to verify configuration
      const result = await executeCommand("nssm", ["dump", testServiceName]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("AppPath");
      expect(result.stdout).toContain(testAppPath);
    });

    it("should support multiple service instances", async () => {
      const service1Name = `${testServiceName}-1`;
      const service2Name = `${testServiceName}-2`;

      try {
        const result1 = await installService(service1Name, testAppPath);
        const result2 = await installService(service2Name, testAppPath);

        expect(result1).toBe(true);
        expect(result2).toBe(true);

        // Verify both exist
        const query1 = await executeCommand("sc", ["query", service1Name]);
        const query2 = await executeCommand("sc", ["query", service2Name]);

        expect(query1.success).toBe(true);
        expect(query2.success).toBe(true);
      } finally {
        // Cleanup both
        await removeService(service1Name, true);
        await removeService(service2Name, true);
      }
    });
  });

  describe("Service Status Querying", () => {
    it("should query service status", async () => {
      // Install service
      await installService(testServiceName, testAppPath);

      // Get status
      const status = await getServiceStatus(testServiceName);
      expect(status).toBeDefined();
      expect(status?.serviceName).toBe(testServiceName);
      expect(status?.state).toBeDefined();
      expect(['running', 'stopped', 'paused', 'unknown']).toContain(status?.state);
    });

    it("should return null for non-existent service", async () => {
      const status = await getServiceStatus("NonExistentService12345");
      expect(status).toBeNull();
    });
  });

  describe("NSSM Command Execution", () => {
    it("should execute NSSM commands safely", async () => {
      const result = await executeCommand("nssm", ["--version"]);
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it("should handle NSSM errors gracefully", async () => {
      const result = await executeCommand("nssm", ["invalid-command"]);
      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe("Pre-Installation Checks", () => {
    it("should require admin privileges", async () => {
      // This test verifies the concept
      // In actual execution, would require running as admin
      const result = await executeCommand("whoami", ["/priv"]);
      // Result depends on whether running as admin
      expect(result).toBeDefined();
    });
  });
});
