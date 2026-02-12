/**
 * Integration Test: Auto-Start on Boot Configuration
 * Tests that service is configured to auto-start on Windows boot
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  installService,
  setServiceStartupType,
  setServiceAutoRestart,
  removeService
} from "../../src/services/windows-service/config/nssm";
import { executeCommand } from "../../src/services/windows-service/utils/process";

describe("Service Auto-Start Configuration", { timeout: 60000 }, () => {
  const testServiceName = `IronBot-Boot-Test-${Date.now()}`;
  const testAppPath = "node.exe";

  beforeEach(async () => {
    // Install test service
    await installService(testServiceName, testAppPath);
  });

  afterEach(async () => {
    // Cleanup
    try {
      await removeService(testServiceName, true);
    } catch (error) {
      // Ignore
    }
  });

  describe("Startup Type Configuration", () => {
    it("should set service startup to AUTO", async () => {
      const result = await setServiceStartupType(testServiceName, 'auto');
      expect(result).toBe(true);

      // Verify configuration was applied
      const dumpResult = await executeCommand("nssm", ["dump", testServiceName]);
      expect(dumpResult.success).toBe(true);
      expect(dumpResult.stdout).toContain("Start");
      expect(dumpResult.stdout).toContain("SERVICE_AUTO_START");
    });

    it("should set service startup to MANUAL", async () => {
      const result = await setServiceStartupType(testServiceName, 'manual');
      expect(result).toBe(true);

      // Verify configuration
      const dumpResult = await executeCommand("nssm", ["dump", testServiceName]);
      expect(dumpResult.success).toBe(true);
      expect(dumpResult.stdout).toContain("SERVICE_DEMAND_START");
    });

    it("should set service startup to DISABLED", async () => {
      const result = await setServiceStartupType(testServiceName, 'disabled');
      expect(result).toBe(true);

      // Verify configuration
      const dumpResult = await executeCommand("nssm", ["dump", testServiceName]);
      expect(dumpResult.success).toBe(true);
      expect(dumpResult.stdout).toContain("SERVICE_DISABLED");
    });
  });

  describe("Auto-Restart Configuration", () => {
    it("should enable auto-restart with default delay", async () => {
      const result = await setServiceAutoRestart(testServiceName, true);
      expect(result).toBe(true);

      // Verify AppRestart is set to Always
      const dumpResult = await executeCommand("nssm", ["dump", testServiceName]);
      expect(dumpResult.success).toBe(true);
      expect(dumpResult.stdout).toContain("AppRestart");
      expect(dumpResult.stdout).toContain("Always");
    });

    it("should set custom restart delay", async () => {
      const delayMs = 5000;
      const result = await setServiceAutoRestart(testServiceName, true, delayMs);
      expect(result).toBe(true);

      // Verify delay was set
      const dumpResult = await executeCommand("nssm", ["dump", testServiceName]);
      expect(dumpResult.success).toBe(true);
      expect(dumpResult.stdout).toContain("AppRestartDelay");
      expect(dumpResult.stdout).toContain(String(delayMs));
    });

    it("should disable auto-restart", async () => {
      // First enable it
      await setServiceAutoRestart(testServiceName, true);

      // Then disable it
      const result = await setServiceAutoRestart(testServiceName, false);
      expect(result).toBe(true);

      // Verify AppRestart is set to Exit
      const dumpResult = await executeCommand("nssm", ["dump", testServiceName]);
      expect(dumpResult.success).toBe(true);
      expect(dumpResult.stdout).toContain("AppRestart");
      expect(dumpResult.stdout).toContain("Exit");
    });
  });

  describe("Boot Start Verification", () => {
    it("should configure service for auto-start on boot", async () => {
      // Apply auto-start configuration
      const startupResult = await setServiceStartupType(testServiceName, 'auto');
      const restartResult = await setServiceAutoRestart(testServiceName, true, 3000);

      expect(startupResult).toBe(true);
      expect(restartResult).toBe(true);

      // Verify both settings via NSSM dump
      const dumpResult = await executeCommand("nssm", ["dump", testServiceName]);
      expect(dumpResult.success).toBe(true);

      const output = dumpResult.stdout;
      expect(output).toContain("Start");
      expect(output).toContain("SERVICE_AUTO_START");
      expect(output).toContain("AppRestart");
      expect(output).toContain("Always");
      expect(output).toContain("AppRestartDelay");
      expect(output).toContain("3000");
    });

    it("should persist startup configuration across service queries", async () => {
      // Set configuration
      await setServiceStartupType(testServiceName, 'auto');

      // Query multiple times to verify persistence
      const dump1 = await executeCommand("nssm", ["dump", testServiceName]);
      const dump2 = await executeCommand("nssm", ["dump", testServiceName]);

      expect(dump1.stdout).toBe(dump2.stdout);
      expect(dump1.stdout).toContain("SERVICE_AUTO_START");
    });
  });

  describe("Boot Start Edge Cases", () => {
    it("should handle rapid startup type changes", async () => {
      const results = await Promise.all([
        setServiceStartupType(testServiceName, 'auto'),
        setServiceStartupType(testServiceName, 'manual'),
        setServiceStartupType(testServiceName, 'auto')
      ]);

      expect(results.every(r => r === true)).toBe(true);

      // Final state should be auto
      const dumpResult = await executeCommand("nssm", ["dump", testServiceName]);
      expect(dumpResult.stdout).toContain("SERVICE_AUTO_START");
    });

    it("should handle startup configuration on service with custom app directory", async () => {
      // Set app directory
      const appDirResult = await executeCommand("nssm", [
        "set",
        testServiceName,
        "AppDirectory",
        process.cwd()
      ]);

      expect(appDirResult.success).toBe(true);

      // Then set startup type
      const startupResult = await setServiceStartupType(testServiceName, 'auto');
      expect(startupResult).toBe(true);

      // Verify both are configured
      const dumpResult = await executeCommand("nssm", ["dump", testServiceName]);
      expect(dumpResult.stdout).toContain("AppDirectory");
      expect(dumpResult.stdout).toContain("SERVICE_AUTO_START");
    });
  });
});
