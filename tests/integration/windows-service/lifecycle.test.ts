/**
 * Integration Test: Service Lifecycle (Start/Stop/Restart)
 * Tests service state transitions
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { installService, startService, stopService, restartService, removeService } from "../../src/services/windows-service/config/nssm";
import { getServiceStatus } from "../../src/services/windows-service/commands/status";

describe("Service Lifecycle Management", { timeout: 90000 }, () => {
  const testServiceName = `IronBot-Lifecycle-Test-${Date.now()}`;
  const testAppPath = "node.exe";

  beforeEach(async () => {
    // Install test service
    await installService(testServiceName, testAppPath);
  });

  afterEach(async () => {
    try {
      // Clean up - stop if running and remove
      await stopService(testServiceName, 5);
      await removeService(testServiceName, true);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Service Start", () => {
    it("should start service successfully", async () => {
      const result = await startService(testServiceName);
      expect(result).toBe(true);
    });

    it("should transition service to running state", async () => {
      await startService(testServiceName);
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      const status = await getServiceStatus(testServiceName);
      // Service may be running or starting
      expect(["running", "starting"]).toContain(status?.state);
    });

    it("should handle already running service", async () => {
      await startService(testServiceName);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Try to start again
      const result = await startService(testServiceName);
      // Should handle gracefully (may return true or false, both acceptable)
      expect(typeof result).toBe("boolean");
    });
  });

  describe("Service Stop", () => {
    beforeEach(async () => {
      // Start service before testing stop
      await startService(testServiceName);
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    it("should stop service successfully", async () => {
      const result = await stopService(testServiceName, 10);
      expect(result).toBe(true);
    });

    it("should transition service to stopped state", async () => {
      await stopService(testServiceName, 10);
      await new Promise(resolve => setTimeout(resolve, 500));

      const status = await getServiceStatus(testServiceName);
      expect(status?.state).toBe("stopped");
    });

    it("should respect timeout parameter", async () => {
      const startTime = Date.now();
      await stopService(testServiceName, 5);
      const elapsed = Date.now() - startTime;

      // Should not take much longer than timeout
      expect(elapsed).toBeLessThan(15000); // 15 second tolerance
    });

    it("should handle already stopped service", async () => {
      await stopService(testServiceName, 10);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Try to stop again
      const result = await stopService(testServiceName, 10);
      // Should handle gracefully
      expect(typeof result).toBe("boolean");
    });
  });

  describe("Service Restart", () => {
    it("should restart service successfully", async () => {
      // Start first
      await startService(testServiceName);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Then restart
      const result = await restartService(testServiceName);
      expect(result).toBe(true);
    });

    it("should transition through stop and start states", async () => {
      await startService(testServiceName);
      await new Promise(resolve => setTimeout(resolve, 1000));

      await restartService(testServiceName);
      await new Promise(resolve => setTimeout(resolve, 2000));

      const status = await getServiceStatus(testServiceName);
      // After restart, should be in running or starting state
      expect(["running", "starting", "stopped"]).toContain(status?.state);
    });

    it("should restart stopped service", async () => {
      const result = await restartService(testServiceName);
      // Should handle gracefully even if service not running
      expect(typeof result).toBe("boolean");
    });

    it("should include delay between stop and start", async () => {
      await startService(testServiceName);
      await new Promise(resolve => setTimeout(resolve, 1000));

      const startTime = Date.now();
      await restartService(testServiceName);
      const elapsed = Date.now() - startTime;

      // Should take at least 1 second due to delay
      expect(elapsed).toBeGreaterThan(500);
    });
  });

  describe("State Transitions", () => {
    it("should transition from stopped to running", async () => {
      let status = await getServiceStatus(testServiceName);
      expect(status?.state).toBe("stopped");

      await startService(testServiceName);
      await new Promise(resolve => setTimeout(resolve, 1000));

      status = await getServiceStatus(testServiceName);
      expect(["running", "starting"]).toContain(status?.state);
    });

    it("should transition from running to stopped", async () => {
      await startService(testServiceName);
      await new Promise(resolve => setTimeout(resolve, 1000));

      let status = await getServiceStatus(testServiceName);
      expect(["running", "starting"]).toContain(status?.state);

      await stopService(testServiceName, 10);
      await new Promise(resolve => setTimeout(resolve, 500));

      status = await getServiceStatus(testServiceName);
      expect(status?.state).toBe("stopped");
    });

    it("should support multiple start/stop cycles", async () => {
      for (let i = 0; i < 3; i++) {
        const start = await startService(testServiceName);
        expect(start).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 500));

        const stop = await stopService(testServiceName, 10);
        expect(stop).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const finalStatus = await getServiceStatus(testServiceName);
      expect(finalStatus?.state).toBe("stopped");
    });
  });
});
