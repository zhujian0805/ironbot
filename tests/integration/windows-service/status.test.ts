/**
 * Integration Test: Service Status Query
 * Tests that service status can be queried and returns correct information
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getServiceStatus } from "../../src/services/windows-service/commands/status";
import { installService } from "../../src/services/windows-service/config/nssm";
import { removeService } from "../../src/services/windows-service/config/nssm";

describe("Service Status Query", { timeout: 60000 }, () => {
  const testServiceName = `IronBot-Status-Test-${Date.now()}`;
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

  describe("Status Query", () => {
    it("should return service status object", async () => {
      const status = await getServiceStatus(testServiceName);
      expect(status).toBeDefined();
      expect(typeof status).toBe("object");
    });

    it("should have service name in status", async () => {
      const status = await getServiceStatus(testServiceName);
      expect(status?.serviceName).toBe(testServiceName);
    });

    it("should have state property", async () => {
      const status = await getServiceStatus(testServiceName);
      expect(status?.state).toBeDefined();
      expect(["running", "stopped", "paused", "starting", "stopping", "unknown"]).toContain(
        status?.state
      );
    });

    it("should have startup type", async () => {
      const status = await getServiceStatus(testServiceName);
      expect(status?.startType).toBeDefined();
      expect(["auto", "manual", "disabled"]).toContain(status?.startType);
    });

    it("should return consistent status on multiple queries", async () => {
      const status1 = await getServiceStatus(testServiceName);
      const status2 = await getServiceStatus(testServiceName);

      expect(status1?.state).toBe(status2?.state);
      expect(status1?.serviceName).toBe(status2?.serviceName);
    });
  });

  describe("Status Output Formatting", () => {
    it("should have displayName", async () => {
      const status = await getServiceStatus(testServiceName);
      expect(status?.displayName).toBeDefined();
    });

    it("should have status code", async () => {
      const status = await getServiceStatus(testServiceName);
      expect(typeof status?.status).toBe("number");
    });

    it("should handle null processId when stopped", async () => {
      const status = await getServiceStatus(testServiceName);
      if (status?.state === "stopped") {
        expect(status.processId).toBeNull();
      }
    });

    it("should have timestamp information", async () => {
      const status = await getServiceStatus(testServiceName);
      expect(status?.lastStartTime === null || status?.lastStartTime instanceof Date).toBe(true);
      expect(status?.lastStopTime === null || status?.lastStopTime instanceof Date).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle non-existent service gracefully", async () => {
      const status = await getServiceStatus("NonExistentService12345");
      expect(status).toBeNull();
    });

    it("should handle invalid service name", async () => {
      const status = await getServiceStatus("");
      expect(status).toBeNull();
    });
  });
});
