import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../src/cli/args.js";

describe("CLI flags", () => {
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

    expect(args).toEqual({
      debug: true,
      logLevel: "WARNING",
      logFile: "logs.json",
      skipHealthChecks: true,
      permissionsFile: "./permissions.yaml"
    });
  });

  it("leaves optional flags undefined when omitted", () => {
    const args = parseCliArgs([]);

    expect(args.debug).toBeUndefined();
    expect(args.logLevel).toBeUndefined();
    expect(args.logFile).toBeUndefined();
    expect(args.skipHealthChecks).toBeUndefined();
    expect(args.permissionsFile).toBeUndefined();
  });
});
