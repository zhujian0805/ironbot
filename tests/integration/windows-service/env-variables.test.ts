/**
 * Integration Test: Environment Variables Access
 * Tests that service can access environment variables from user profile
 */

import { describe, it, expect } from "bun:test";
import {
  validateEnvironmentVariables,
  getEnvironmentFromUser,
  getEnvironmentSummary
} from "../../src/services/windows-service/utils/env";

describe("Environment Variables Access", () => {
  describe("Environment Variable Validation", () => {
    it("should validate critical environment variables", async () => {
      const result = await validateEnvironmentVariables();
      expect(result).toBeDefined();
      expect(result.checks).toBeDefined();
      expect(Array.isArray(result.checks)).toBe(true);
    });

    it("should check SLACK_BOT_TOKEN", async () => {
      const result = await validateEnvironmentVariables(["SLACK_BOT_TOKEN"]);
      expect(result.checks.length).toBeGreaterThan(0);
      const slackCheck = result.checks.find(c => c.name.includes("SLACK_BOT_TOKEN"));
      expect(slackCheck).toBeDefined();
    });

    it("should check ANTHROPIC_API_KEY", async () => {
      const result = await validateEnvironmentVariables(["ANTHROPIC_API_KEY"]);
      const apiCheck = result.checks.find(c => c.name.includes("ANTHROPIC_API_KEY"));
      expect(apiCheck).toBeDefined();
    });

    it("should return validation result", async () => {
      const result = await validateEnvironmentVariables();
      expect(result.valid === true || result.valid === false).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe("Environment Retrieval", () => {
    it("should get environment from user", async () => {
      const env = await getEnvironmentFromUser("testuser");
      expect(env).toBeDefined();
      expect(typeof env).toBe("object");
    });

    it("should return record of variables", async () => {
      const env = await getEnvironmentFromUser("testuser");
      expect(typeof env).toBe("object");
      expect(!Array.isArray(env)).toBe(true);
    });
  });

  describe("Environment Summary", () => {
    it("should get environment summary", () => {
      const summary = getEnvironmentSummary();
      expect(summary).toBeDefined();
      expect(summary.criticalVarsSet).toBeDefined();
      expect(summary.criticalVarsMissing).toBeDefined();
      expect(Array.isArray(summary.criticalVarsSet)).toBe(true);
      expect(Array.isArray(summary.criticalVarsMissing)).toBe(true);
    });

    it("should categorize variables", () => {
      const summary = getEnvironmentSummary();
      const totalVars = summary.criticalVarsSet.length + summary.criticalVarsMissing.length;
      expect(totalVars).toBeGreaterThan(0);
    });
  });
});
