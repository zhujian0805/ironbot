import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runReleaseCheck } from "../../src/cli/check_release.ts";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";

// Mock logger
vi.mock("../../src/utils/logging.ts", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn()
  }
}));

describe("Release Check", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "release-check-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("runReleaseCheck", () => {
    it("returns false for non-existent permissions file", () => {
      const nonExistentFile = path.join(tempDir, "nonexistent.yaml");

      const result = runReleaseCheck(nonExistentFile);

      expect(result).toBe(false);
    });

    it("returns true for valid permissions file", () => {
      const validPermissions = `
version: "1.0"
tools:
  allowed:
    - run_powershell
  blocked: []
skills:
  allowed: []
  blocked: []
`;

      const permissionsFile = path.join(tempDir, "valid.yaml");
      fs.writeFileSync(permissionsFile, validPermissions);

      const result = runReleaseCheck(permissionsFile);

      expect(result).toBe(true);
    });

    it("returns false for invalid permissions file", () => {
      const invalidPermissions = `
version: "1.0"
tools:
  allowed: "not an array"
`;

      const permissionsFile = path.join(tempDir, "invalid.yaml");
      fs.writeFileSync(permissionsFile, invalidPermissions);

      const result = runReleaseCheck(permissionsFile);

      expect(result).toBe(false);
    });

    it("returns false for malformed YAML", () => {
      const malformedYaml = `
version: "1.0"
tools:
  allowed:
    - item1
  - invalid structure
`;

      const permissionsFile = path.join(tempDir, "malformed.yaml");
      fs.writeFileSync(permissionsFile, malformedYaml);

      const result = runReleaseCheck(permissionsFile);

      expect(result).toBe(false);
    });

    it("handles empty permissions file", () => {
      const emptyFile = path.join(tempDir, "empty.yaml");
      fs.writeFileSync(emptyFile, "");

      const result = runReleaseCheck(emptyFile);

      expect(result).toBe(false);
    });
  });
});