import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { parseCliArgs } from "../../src/cli/args.ts";

describe("CLI flags", () => {
  beforeEach(() => {
    // Mock process.exit to prevent actual exit in tests
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses all supported flags", () => {
    const args = parseCliArgs([
      "--debug",
      "--log-level",
      "WARNING",
      "--log-file",
      "logs.json",
      "--skip-health-checks",
      "--permissions-file",
      "./permissions.yaml"
    ]);

    expect(args.debug).toBe(true);
    expect(args.logLevel).toBe("WARNING");
    expect(args.logFile).toBe("logs.json");
    expect(args.skipHealthChecks).toBe(true);
    expect(args.permissionsFile).toBe("./permissions.yaml");
    expect(args.isServiceCommand).toBe(false);
  });

  it("leaves optional flags undefined when omitted", () => {
    const args = parseCliArgs([]);

    expect(args.debug).toBeUndefined();
    expect(args.logLevel).toBeUndefined();
    expect(args.logFile).toBeUndefined();
    expect(args.skipHealthChecks).toBeUndefined();
    expect(args.permissionsFile).toBeUndefined();
    expect(args.isServiceCommand).toBe(false);
  });

  it("detects service commands by checking first argument", () => {
    // Check that service command is detected when it's the first argument
    const args1 = parseCliArgs(["windows-service"]);
    expect(args1.isServiceCommand).toBe(true);

    const args2 = parseCliArgs(["service"]);
    expect(args2.isServiceCommand).toBe(true);

    // Service command NOT detected when it's not the first argument
    const args3 = parseCliArgs(["--debug", "windows-service"]);
    expect(args3.isServiceCommand).toBe(false);
  });

  it("parses flags before service commands", () => {
    const args = parseCliArgs([
      "--debug",
      "--log-level",
      "DEBUG",
      "windows-service"
    ]);

    expect(args.debug).toBe(true);
    expect(args.logLevel).toBe("DEBUG");
    expect(args.isServiceCommand).toBe(false); // windows-service is not first argument
  });
});
