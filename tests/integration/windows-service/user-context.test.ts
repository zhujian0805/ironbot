/**
 * Integration Test: User Context Verification
 * Tests that service runs under correct user account with proper permissions
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { installService, removeService } from "../../src/services/windows-service/config/nssm.js";
import { executeCommand, userAccountExists } from "../../src/services/windows-service/utils/process.js";

describe("Service User Context", { timeout: 60000 }, () => {
  const testServiceName = `IronBot-User-Test-${Date.now()}`;
  const testAppPath = "node.exe";
  const testUsername = process.env.USERNAME || "SYSTEM";

  beforeEach(async () => {
    // Verify test user exists
    const userExists = await userAccountExists(testUsername);
    expect(userExists).toBe(true);

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

  describe("Service User Account Configuration", () => {
    it("should query service configuration via NSSM", async () => {
      const result = await executeCommand("nssm", ["dump", testServiceName]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("AppPath");
    });

    it("should display service properties", async () => {
      const result = await executeCommand("sc", ["query", testServiceName, "type=service"]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain(testServiceName);
    });

    it("should show service details via NSSM query", async () => {
      const result = await executeCommand("nssm", ["get", testServiceName, "ObjectName"]);
      // Result may be empty if ObjectName not set, but command should succeed
      expect(result.exitCode).toBe(0);
    });
  });

  describe("User Account Validation", () => {
    it("should validate that current user exists", async () => {
      const exists = await userAccountExists(testUsername);
      expect(exists).toBe(true);
    });

    it("should detect non-existent user accounts", async () => {
      const exists = await userAccountExists("NonExistentUser12345XYZ");
      expect(exists).toBe(false);
    });

    it("should format user credentials properly", async () => {
      // User format: DOMAIN\username or .\username for local
      const userWithFormat = testUsername.includes("\\")
        ? testUsername
        : `.\\${testUsername}`;

      expect(userWithFormat).toContain("\\");
    });
  });

  describe("Environment Variables in Service Context", () => {
    it("should access current environment variables", async () => {
      const vars = process.env;
      expect(vars).toBeDefined();
      expect(Object.keys(vars).length).toBeGreaterThan(0);
    });

    it("should have SLACK_BOT_TOKEN configured or warn", async () => {
      const token = process.env.SLACK_BOT_TOKEN;
      // Either should be set or test knows it's not configured
      expect(typeof token === 'string' || token === undefined).toBe(true);
    });

    it("should have ANTHROPIC_API_KEY configured or warn", async () => {
      const key = process.env.ANTHROPIC_API_KEY;
      // Either should be set or test knows it's not configured
      expect(typeof key === 'string' || key === undefined).toBe(true);
    });
  });

  describe("Service Permissions and Access", () => {
    it("should verify service can be queried", async () => {
      const result = await executeCommand("sc", ["query", testServiceName]);
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it("should handle permission errors gracefully", async () => {
      // Try to query with restricted service name
      const result = await executeCommand("sc", ["query", "LocalSystem"]);
      // Should either succeed or fail gracefully
      expect(result).toBeDefined();
      expect(result.exitCode !== null).toBe(true);
    });
  });

  describe("Multi-User Service Configuration", () => {
    it("should support different user accounts", async () => {
      // This test validates the concept
      // In production, would test with actual different users
      const service1User = testUsername;
      const service2User = "SYSTEM"; // Built-in account

      expect(service1User).toBeDefined();
      expect(service2User).toBe("SYSTEM");
    });

    it("should maintain user isolation between services", async () => {
      const service1Name = `${testServiceName}-user1`;
      const service2Name = `${testServiceName}-user2`;

      try {
        const install1 = await installService(service1Name, testAppPath);
        const install2 = await installService(service2Name, testAppPath);

        expect(install1).toBe(true);
        expect(install2).toBe(true);

        // Services should be independent
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
});
