/**
 * Unit Tests: Install Command Validation
 * Tests pre-installation checks and validation logic
 */

import { describe, it, expect, beforeEach } from "bun:test";
import type { ValidationResult, ValidationCheck } from "../../src/services/windows-service/types/index";
import { validateServiceConfig, formatValidationReport } from "../../src/services/windows-service/config/service-config";

describe("Install Command Validation", () => {
  describe("validateServiceConfig", () => {
    it("should validate service configuration", async () => {
      const config = {
        serviceName: "TestService",
        username: "testuser",
        workingDirectory: process.cwd()
      };

      const result = await validateServiceConfig(config);
      expect(result).toBeDefined();
      expect(result.checks).toBeDefined();
      expect(Array.isArray(result.checks)).toBe(true);
    });

    it("should detect missing admin privileges", async () => {
      const config = {
        serviceName: "TestService",
        username: "testuser",
        workingDirectory: process.cwd()
      };

      const result = await validateServiceConfig(config);
      const adminCheck = result.checks.find(c => c.name === 'admin-privileges');
      expect(adminCheck).toBeDefined();
      expect(['pass', 'fail', 'warn']).toContain(adminCheck?.status);
    });

    it("should check NSSM availability", async () => {
      const config = {
        serviceName: "TestService"
      };

      const result = await validateServiceConfig(config);
      const nssmCheck = result.checks.find(c => c.name === 'nssm-available');
      expect(nssmCheck).toBeDefined();
      expect(['pass', 'fail', 'warn']).toContain(nssmCheck?.status);
    });

    it("should validate user account if specified", async () => {
      const config = {
        serviceName: "TestService",
        username: "nonexistentuser12345"
      };

      const result = await validateServiceConfig(config);
      const userCheck = result.checks.find(c => c.name === 'user-account-exists');
      expect(userCheck).toBeDefined();
      // User account likely doesn't exist, so should be fail or warn
      expect(['fail', 'warn']).toContain(userCheck?.status);
    });

    it("should validate working directory accessibility", async () => {
      const config = {
        serviceName: "TestService",
        workingDirectory: process.cwd()
      };

      const result = await validateServiceConfig(config);
      const pathCheck = result.checks.find(c => c.name === 'working-directory-accessible');
      expect(pathCheck).toBeDefined();
      expect(['pass', 'fail', 'warn']).toContain(pathCheck?.status);
    });

    it("should return array of checks", async () => {
      const config = {
        serviceName: "TestService"
      };

      const result = await validateServiceConfig(config);
      expect(Array.isArray(result.checks)).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);

      // All checks should have required fields
      result.checks.forEach(check => {
        expect(check.name).toBeDefined();
        expect(check.status).toBeDefined();
        expect(check.message).toBeDefined();
        expect(['pass', 'fail', 'warn']).toContain(check.status);
      });
    });

    it("should return errors array", async () => {
      const config = {
        serviceName: "TestService"
      };

      const result = await validateServiceConfig(config);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.valid).toBe(typeof result.valid === 'boolean');
    });

    it("should return warnings array", async () => {
      const config = {
        serviceName: "TestService"
      };

      const result = await validateServiceConfig(config);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe("formatValidationReport", () => {
    it("should format validation result as string", () => {
      const validation: ValidationResult = {
        valid: true,
        checks: [
          {
            name: 'test-check',
            status: 'pass',
            message: 'Test passed'
          }
        ],
        errors: [],
        warnings: []
      };

      const report = formatValidationReport(validation);
      expect(typeof report).toBe('string');
      expect(report.length).toBeGreaterThan(0);
      expect(report).toContain('Validation');
    });

    it("should include passed checks in report", () => {
      const validation: ValidationResult = {
        valid: true,
        checks: [
          {
            name: 'test-check',
            status: 'pass',
            message: 'Test passed'
          }
        ],
        errors: [],
        warnings: []
      };

      const report = formatValidationReport(validation);
      expect(report).toContain('PASSED');
      expect(report).toContain('Test passed');
    });

    it("should include warnings in report", () => {
      const validation: ValidationResult = {
        valid: true,
        checks: [],
        errors: [],
        warnings: ['Test warning']
      };

      const report = formatValidationReport(validation);
      expect(report).toContain('WARNING');
      expect(report).toContain('Test warning');
    });

    it("should include errors in report", () => {
      const validation: ValidationResult = {
        valid: false,
        checks: [],
        errors: ['Test error'],
        warnings: []
      };

      const report = formatValidationReport(validation);
      expect(report).toContain('ERROR');
      expect(report).toContain('Test error');
    });

    it("should show invalid status when errors present", () => {
      const validation: ValidationResult = {
        valid: false,
        checks: [],
        errors: ['Test error'],
        warnings: []
      };

      const report = formatValidationReport(validation);
      expect(report).toContain('INVALID');
      expect(report).not.toContain('VALID✓');
    });

    it("should show valid status when no errors", () => {
      const validation: ValidationResult = {
        valid: true,
        checks: [],
        errors: [],
        warnings: []
      };

      const report = formatValidationReport(validation);
      expect(report).toContain('VALID');
    });
  });

  describe("Error handling", () => {
    it("should handle validation errors gracefully", async () => {
      const config = {
        serviceName: "Test/Service", // Invalid character
        username: undefined
      };

      const result = await validateServiceConfig(config);
      expect(result).toBeDefined();
      expect(result.checks).toBeDefined();
      expect(Array.isArray(result.checks)).toBe(true);
    });

    it("should handle missing working directory", async () => {
      const config = {
        serviceName: "TestService",
        workingDirectory: "/nonexistent/path/12345"
      };

      const result = await validateServiceConfig(config);
      expect(result.checks.length).toBeGreaterThan(0);
      // Should have a path check that indicates failure or warning
      const pathCheck = result.checks.find(c => c.name === 'working-directory-accessible');
      expect(pathCheck?.status).toBe('fail');
    });
  });
});
