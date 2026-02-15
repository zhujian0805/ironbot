import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { parseCliArgs } from "../../src/cli/args.ts";

// Mock the service command handlers to prevent process.exit during testing
vi.mock("../../src/services/windows-service/commands/install.ts", () => ({
  handleInstallCommand: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../../src/services/windows-service/commands/uninstall.ts", () => ({
  handleUninstallCommand: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../../src/services/windows-service/commands/status.ts", () => ({
  handleStatusCommand: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../../src/services/windows-service/commands/logs.ts", () => ({
  handleLogsCommand: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../../src/services/windows-service/config/nssm.ts", () => ({
  startService: vi.fn().mockResolvedValue(true),
  stopService: vi.fn().mockResolvedValue(true),
  restartService: vi.fn().mockResolvedValue(true)
}));

// Mock process.exit to prevent test termination
const originalExit = process.exit;
beforeAll(() => {
  process.exit = vi.fn() as any;
});

afterAll(() => {
  process.exit = originalExit;
});

describe("CLI Args Parser", () => {
  describe("parseCliArgs", () => {
    it("parses debug flag", () => {
      const args = parseCliArgs(["--debug"]);
      expect(args.debug).toBe(true);
      expect(args.isServiceCommand).toBe(false);
    });

    it("parses log-level option", () => {
      const args = parseCliArgs(["--log-level", "DEBUG"]);
      expect(args.logLevel).toBe("DEBUG");
      expect(args.isServiceCommand).toBe(false);
    });

    it("parses log-file option", () => {
      const args = parseCliArgs(["--log-file", "/path/to/log.txt"]);
      expect(args.logFile).toBe("/path/to/log.txt");
      expect(args.isServiceCommand).toBe(false);
    });

    it("parses skip-health-checks flag", () => {
      const args = parseCliArgs(["--skip-health-checks"]);
      expect(args.skipHealthChecks).toBe(true);
      expect(args.isServiceCommand).toBe(false);
    });

    it("parses permissions-file option", () => {
      const args = parseCliArgs(["--permissions-file", "/path/to/permissions.yaml"]);
      expect(args.permissionsFile).toBe("/path/to/permissions.yaml");
      expect(args.isServiceCommand).toBe(false);
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
      expect(args.isServiceCommand).toBe(false);
    });

    it("returns default values for unset options", () => {
      const args = parseCliArgs([]);
      expect(args.debug).toBeUndefined(); // Now returns undefined when not provided
      expect(args.logLevel).toBeUndefined();
      expect(args.logFile).toBeUndefined();
      expect(args.skipHealthChecks).toBeUndefined(); // Now returns undefined when not provided
      expect(args.permissionsFile).toBeUndefined();
      expect(args.isServiceCommand).toBe(false);
    });

    it("handles empty args array", () => {
      const args = parseCliArgs([]);
      expect(args).toEqual({
        debug: undefined, // Now returns undefined when not provided
        logLevel: undefined,
        logFile: undefined,
        skipHealthChecks: undefined, // Now returns undefined when not provided
        permissionsFile: undefined,
        isServiceCommand: false
      });
    });

    describe("service command detection", () => {
      it("detects windows-service command", () => {
        const args = parseCliArgs(["windows-service", "status"]);
        expect(args.isServiceCommand).toBe(true);
      });

      it("detects service alias command", () => {
        const args = parseCliArgs(["service", "start"]);
        expect(args.isServiceCommand).toBe(true);
      });

      it("detects windows-service with options", () => {
        const args = parseCliArgs(["windows-service", "install", "--service-name", "TestService"]);
        expect(args.isServiceCommand).toBe(true);
      });

      it("detects service alias with options", () => {
        const args = parseCliArgs(["service", "logs", "--lines", "100"]);
        expect(args.isServiceCommand).toBe(true);
      });

      it("does not detect service command for regular args", () => {
        const args = parseCliArgs(["--debug", "--log-level", "INFO"]);
        expect(args.isServiceCommand).toBe(false);
      });

      it("does not detect service command for unrelated commands", () => {
        // Commander.js handles unknown commands gracefully by showing help
        // but our detection logic should still correctly identify this as not a service command
        const args = parseCliArgs(["some-other-command", "arg"]);
        expect(args.isServiceCommand).toBe(false);
      });
    });
  });
});