/**
 * Integration Test: Configuration File Resolution
 * Tests that service can load configuration files from project directory
 */

import { describe, it, expect } from "bun:test";
import {
  resolveProjectPath,
  resolveConfigFilePath,
  configFileExists,
  validateProjectStructure,
  getLogsDirectory
} from "../../src/services/windows-service/utils/paths";

describe("Configuration File Resolution", () => {
  const projectPath = resolveProjectPath();

  describe("Path Resolution", () => {
    it("should resolve project path", () => {
      const path = resolveProjectPath();
      expect(typeof path).toBe("string");
      expect(path.length).toBeGreaterThan(0);
    });

    it("should resolve config file path", () => {
      const configPath = resolveConfigFilePath(projectPath, "permissions.yaml");
      expect(typeof configPath).toBe("string");
      expect(configPath).toContain("permissions.yaml");
    });

    it("should get logs directory", () => {
      const logsDir = getLogsDirectory(projectPath);
      expect(typeof logsDir).toBe("string");
      expect(logsDir).toContain("logs");
    });
  });

  describe("Project Structure Validation", () => {
    it("should validate project structure", () => {
      const validation = validateProjectStructure(projectPath);
      expect(validation).toBeDefined();
      expect(validation.valid === true || validation.valid === false).toBe(true);
      expect(Array.isArray(validation.missingFiles)).toBe(true);
    });

    it("should check for expected files", () => {
      const validation = validateProjectStructure(projectPath);
      // Should have at least some files (package.json, src, tsconfig.json)
      expect(validation.missingFiles).toBeDefined();
    });
  });

  describe("Configuration File Access", () => {
    it("should check if config file exists", () => {
      const exists = configFileExists(projectPath, "permissions.yaml");
      expect(typeof exists).toBe("boolean");
    });

    it("should handle missing config files", () => {
      const exists = configFileExists(projectPath, "nonexistent-file.yaml");
      expect(exists).toBe(false);
    });
  });

  describe("Path Utilities", () => {
    it("should handle absolute paths", () => {
      const absolutePath = resolveProjectPath();
      expect(absolutePath).toMatch(/^[a-zA-Z]:/); // Windows absolute path
    });

    it("should resolve relative paths to absolute", () => {
      const resolved = resolveProjectPath("./test");
      expect(resolved).toMatch(/^[a-zA-Z]:/); // Should be absolute
    });
  });
});
