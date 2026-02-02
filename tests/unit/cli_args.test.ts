import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../src/cli/args.ts";

describe("CLI Args Parser", () => {
  describe("parseCliArgs", () => {
    it("parses debug flag", () => {
      const args = parseCliArgs(["--debug"]);
      expect(args.debug).toBe(true);
    });

    it("parses log-level option", () => {
      const args = parseCliArgs(["--log-level", "DEBUG"]);
      expect(args.logLevel).toBe("DEBUG");
    });

    it("parses log-file option", () => {
      const args = parseCliArgs(["--log-file", "/path/to/log.txt"]);
      expect(args.logFile).toBe("/path/to/log.txt");
    });

    it("parses skip-health-checks flag", () => {
      const args = parseCliArgs(["--skip-health-checks"]);
      expect(args.skipHealthChecks).toBe(true);
    });

    it("parses permissions-file option", () => {
      const args = parseCliArgs(["--permissions-file", "/path/to/permissions.yaml"]);
      expect(args.permissionsFile).toBe("/path/to/permissions.yaml");
    });

    it("parses multiple options", () => {
      const args = parseCliArgs([
        "--debug",
        "--log-level", "INFO",
        "--log-file", "app.log",
        "--skip-health-checks",
        "--permissions-file", "perms.yaml"
      ]);

      expect(args.debug).toBe(true);
      expect(args.logLevel).toBe("INFO");
      expect(args.logFile).toBe("app.log");
      expect(args.skipHealthChecks).toBe(true);
      expect(args.permissionsFile).toBe("perms.yaml");
    });

    it("returns undefined for unset options", () => {
      const args = parseCliArgs([]);
      expect(args.debug).toBeUndefined();
      expect(args.logLevel).toBeUndefined();
      expect(args.logFile).toBeUndefined();
      expect(args.skipHealthChecks).toBeUndefined();
      expect(args.permissionsFile).toBeUndefined();
    });

    it("handles empty args array", () => {
      const args = parseCliArgs([]);
      expect(args).toEqual({
        debug: undefined,
        logLevel: undefined,
        logFile: undefined,
        skipHealthChecks: undefined,
        permissionsFile: undefined
      });
    });
  });
});