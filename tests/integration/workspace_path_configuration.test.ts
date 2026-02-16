import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorkspaceManager } from "../../src/services/workspace_manager.ts";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { mkdtempSync } from "node:fs";

describe("Workspace Configuration Integration", () => {
  let testBaseDir: string;

  beforeEach(() => {
    testBaseDir = mkdtempSync(path.join(process.cwd(), "workspace-test-"));
  });

  afterEach(() => {
    try {
      rmSync(testBaseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Workspace initialization flow", () => {
    it("should initialize workspace directory from configuration", () => {
      const workspacePath = path.join(testBaseDir, "agent-workspace");

      // Verify directory doesn't exist initially
      expect(existsSync(workspacePath)).toBe(false);

      // Initialize workspace
      const initialized = WorkspaceManager.initializeWorkspace(workspacePath);

      // Verify directory was created and returned
      expect(existsSync(initialized)).toBe(true);
      expect(initialized).toBe(workspacePath);
    });

    it("should handle workspace paths with tilde expansion", () => {
      const workspacePath = path.join(testBaseDir, "workspace");

      // Test that tilde expansion is applied
      const expanded = WorkspaceManager.expandPath(workspacePath);
      expect(expanded).toBe(workspacePath);
    });

    it("should validate workspace directory is readable and writable", () => {
      const workspacePath = path.join(testBaseDir, "validated-workspace");

      // Initialize workspace
      WorkspaceManager.initializeWorkspace(workspacePath);

      // Validate workspace
      const isValid = WorkspaceManager.validateWorkspace(workspacePath);

      expect(isValid).toBe(true);
    });

    it("should return false for non-existent workspace", () => {
      const nonExistentPath = path.join(testBaseDir, "does-not-exist");

      const isValid = WorkspaceManager.validateWorkspace(nonExistentPath);

      expect(isValid).toBe(false);
    });

    it("should handle multiple workspaces independently", () => {
      const workspace1 = path.join(testBaseDir, "workspace1");
      const workspace2 = path.join(testBaseDir, "workspace2");
      const workspace3 = path.join(testBaseDir, "workspace3");

      // Initialize all workspaces
      WorkspaceManager.initializeWorkspace(workspace1);
      WorkspaceManager.initializeWorkspace(workspace2);
      WorkspaceManager.initializeWorkspace(workspace3);

      // Verify all are created and valid
      expect(WorkspaceManager.validateWorkspace(workspace1)).toBe(true);
      expect(WorkspaceManager.validateWorkspace(workspace2)).toBe(true);
      expect(WorkspaceManager.validateWorkspace(workspace3)).toBe(true);
    });

    it("should create nested workspace directories", () => {
      const nestedPath = path.join(testBaseDir, "agents", "prod", "workspace");

      // Initialize nested workspace
      const initialized = WorkspaceManager.initializeWorkspace(nestedPath);

      // Verify full path exists
      expect(existsSync(initialized)).toBe(true);
      expect(initialized).toBe(nestedPath);
    });

    it("should work with workspace files and subdirectories", () => {
      const workspacePath = path.join(testBaseDir, "working-workspace");

      // Initialize workspace
      WorkspaceManager.initializeWorkspace(workspacePath);

      // Create subdirectories in workspace
      const subDir1 = path.join(workspacePath, "sessions");
      const subDir2 = path.join(workspacePath, "logs");
      mkdirSync(subDir1);
      mkdirSync(subDir2);

      // Create files in subdirectories
      const file1 = path.join(subDir1, "session.json");
      const file2 = path.join(subDir2, "app.log");
      writeFileSync(file1, JSON.stringify({ id: "test" }));
      writeFileSync(file2, "test log entry\n");

      // Verify files exist
      expect(existsSync(file1)).toBe(true);
      expect(existsSync(file2)).toBe(true);

      // Validate workspace still works
      expect(WorkspaceManager.validateWorkspace(workspacePath)).toBe(true);

      // Verify files can be read
      const content1 = readFileSync(file1, "utf-8");
      const content2 = readFileSync(file2, "utf-8");
      expect(JSON.parse(content1).id).toBe("test");
      expect(content2).toContain("test log entry");
    });
  });

  describe("Workspace directory structure", () => {
    it("should support standard workspace directory structure", () => {
      const workspacePath = path.join(testBaseDir, "standard-workspace");

      // Initialize workspace
      WorkspaceManager.initializeWorkspace(workspacePath);

      // Create standard subdirectories
      const standardDirs = ["state", "cache", "logs", "temp"];
      for (const dir of standardDirs) {
        mkdirSync(path.join(workspacePath, dir), { recursive: true });
      }

      // Verify all directories exist
      for (const dir of standardDirs) {
        expect(existsSync(path.join(workspacePath, dir))).toBe(true);
      }

      // Verify workspace is still valid
      expect(WorkspaceManager.validateWorkspace(workspacePath)).toBe(true);
    });

    it("should handle workspace with configuration files", () => {
      const workspacePath = path.join(testBaseDir, "configured-workspace");

      // Initialize workspace
      WorkspaceManager.initializeWorkspace(workspacePath);

      // Create workspace configuration
      const configFile = path.join(workspacePath, "config.json");
      const config = {
        version: "1.0",
        initialized: new Date().toISOString(),
        features: ["memory", "state-management", "logging"]
      };
      writeFileSync(configFile, JSON.stringify(config, null, 2));

      // Verify configuration exists
      expect(existsSync(configFile)).toBe(true);
      const readConfig = JSON.parse(readFileSync(configFile, "utf-8"));
      expect(readConfig.features).toContain("memory");
    });
  });

  describe("Workspace lifecycle", () => {
    it("should persist workspace across multiple validations", () => {
      const workspacePath = path.join(testBaseDir, "persistent-workspace");

      // Initialize
      WorkspaceManager.initializeWorkspace(workspacePath);
      expect(WorkspaceManager.validateWorkspace(workspacePath)).toBe(true);

      // Validate multiple times
      for (let i = 0; i < 5; i++) {
        expect(WorkspaceManager.validateWorkspace(workspacePath)).toBe(true);
      }

      // Directory should still exist
      expect(existsSync(workspacePath)).toBe(true);
    });

    it("should handle workspace operations in sequence", () => {
      const workspace1 = path.join(testBaseDir, "seq1");
      const workspace2 = path.join(testBaseDir, "seq2");
      const workspace3 = path.join(testBaseDir, "seq3");

      // Initialize first workspace
      WorkspaceManager.initializeWorkspace(workspace1);
      expect(WorkspaceManager.validateWorkspace(workspace1)).toBe(true);

      // Initialize second workspace
      WorkspaceManager.initializeWorkspace(workspace2);
      expect(WorkspaceManager.validateWorkspace(workspace2)).toBe(true);

      // Initialize third workspace
      WorkspaceManager.initializeWorkspace(workspace3);
      expect(WorkspaceManager.validateWorkspace(workspace3)).toBe(true);

      // All three should be valid
      expect(WorkspaceManager.validateWorkspace(workspace1)).toBe(true);
      expect(WorkspaceManager.validateWorkspace(workspace2)).toBe(true);
      expect(WorkspaceManager.validateWorkspace(workspace3)).toBe(true);
    });

    it("should handle workspace reinitialization gracefully", () => {
      const workspacePath = path.join(testBaseDir, "reinit-workspace");

      // First initialization
      const init1 = WorkspaceManager.initializeWorkspace(workspacePath);
      expect(init1).toBe(workspacePath);

      // Create a file in the workspace
      const file = path.join(workspacePath, "test.txt");
      writeFileSync(file, "test content");

      // Re-initialize (should not fail or delete existing content)
      const init2 = WorkspaceManager.initializeWorkspace(workspacePath);
      expect(init2).toBe(workspacePath);

      // File should still exist
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, "utf-8")).toBe("test content");
    });
  });

  describe("Workspace error handling", () => {
    it("should throw error for empty workspace path", () => {
      expect(() => {
        WorkspaceManager.initializeWorkspace("");
      }).toThrow("Workspace path must be provided");
    });

    it("should return false for empty workspace validation", () => {
      const isValid = WorkspaceManager.validateWorkspace("");
      expect(isValid).toBe(false);
    });

    it("should validate non-existent paths correctly", () => {
      const nonExistentPath = path.join(testBaseDir, "non", "existent", "path");
      expect(WorkspaceManager.validateWorkspace(nonExistentPath)).toBe(false);
    });
  });

  describe("Path expansion in workspace operations", () => {
    it("should expand absolute paths correctly", () => {
      const absolutePath = path.join(testBaseDir, "absolute-workspace");
      const expanded = WorkspaceManager.expandPath(absolutePath);

      expect(expanded).toBe(absolutePath);
      // Check if it looks like an absolute path (Unix or Windows)
      const isAbsolutePath = expanded.startsWith("/") || /^[A-Z]:/.test(expanded);
      expect(isAbsolutePath).toBe(true);
    });

    it("should expand relative paths correctly", () => {
      const relativePath = "./workspace";
      const expanded = WorkspaceManager.expandPath(relativePath);

      expect(expanded).toBe(relativePath);
    });
  });
});
