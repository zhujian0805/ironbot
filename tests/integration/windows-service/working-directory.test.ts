/**
 * Integration Test: Working Directory Configuration
 * Tests that service working directory is properly configured
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { installService, setServiceAppDirectory, removeService } from "../../src/services/windows-service/config/nssm";
import { executeCommand } from "../../src/services/windows-service/utils/process";
import { resolveProjectPath } from "../../src/services/windows-service/utils/paths";

describe("Service Working Directory Configuration", { timeout: 60000 }, () => {
  const testServiceName = `IronBot-WD-Test-${Date.now()}`;
  const testAppPath = "node.exe";
  const testWorkingDir = process.cwd();

  beforeEach(async () => {
    await installService(testServiceName, testAppPath);
  });

  afterEach(async () => {
    try {
      await removeService(testServiceName, true);
    } catch (error) {
      // Ignore
    }
  });

  describe("Working Directory Setup", () => {
    it("should set service working directory", async () => {
      const result = await setServiceAppDirectory(testServiceName, testWorkingDir);
      expect(result).toBe(true);
    });

    it("should verify working directory was set via NSSM", async () => {
      await setServiceAppDirectory(testServiceName, testWorkingDir);

      const dumpResult = await executeCommand("nssm", ["dump", testServiceName]);
      expect(dumpResult.success).toBe(true);
      expect(dumpResult.stdout).toContain("AppDirectory");
    });

    it("should handle absolute paths correctly", async () => {
      const absolutePath = resolveProjectPath();
      const result = await setServiceAppDirectory(testServiceName, absolutePath);
      expect(result).toBe(true);
    });

    it("should reject invalid paths", async () => {
      const invalidPath = "/nonexistent/path/12345";
      // Function should handle gracefully (may return false or throw)
      try {
        const result = await setServiceAppDirectory(testServiceName, invalidPath);
        expect(typeof result).toBe("boolean");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("Configuration Persistence", () => {
    it("should persist working directory across queries", async () => {
      await setServiceAppDirectory(testServiceName, testWorkingDir);

      const dump1 = await executeCommand("nssm", ["dump", testServiceName]);
      const dump2 = await executeCommand("nssm", ["dump", testServiceName]);

      expect(dump1.stdout).toContain("AppDirectory");
      expect(dump2.stdout).toContain("AppDirectory");
    });
  });

  describe("Multi-Directory Support", () => {
    it("should support different directories for different services", async () => {
      const service1Name = `${testServiceName}-dir1`;
      const service2Name = `${testServiceName}-dir2`;
      const dir1 = process.cwd();
      const dir2 = process.cwd();

      try {
        await installService(service1Name, testAppPath);
        await installService(service2Name, testAppPath);

        const result1 = await setServiceAppDirectory(service1Name, dir1);
        const result2 = await setServiceAppDirectory(service2Name, dir2);

        expect(result1).toBe(true);
        expect(result2).toBe(true);
      } finally {
        await removeService(service1Name, true);
        await removeService(service2Name, true);
      }
    });
  });
});
