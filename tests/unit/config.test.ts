import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../../src/config.ts";

const originalEnv = { ...process.env };

const resetEnv = () => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
};

beforeEach(() => {
  resetEnv();
});

afterEach(() => {
  resetEnv();
});

describe("resolveConfig", () => {
  it("lets CLI args override environment defaults", () => {
    process.env.DEBUG = "0";
    process.env.LOG_LEVEL = "INFO";
    process.env.LOG_FILE = "env.log";
    process.env.PERMISSIONS_FILE = "env.yaml";

    const config = resolveConfig({
      debug: true,
      logLevel: "ERROR",
      logFile: "cli.log",
      permissionsFile: "cli.yaml",
      skipHealthChecks: true
    });

    expect(config.debug).toBe(true);
    expect(config.logLevel).toBe("ERROR");
    expect(config.logFile).toBe("cli.log");
    expect(config.permissionsFile).toBe("cli.yaml");
    expect(config.skipHealthChecks).toBe(true);
  });

  it("provides defaults for permissions file, log level, and booleans", () => {
    delete process.env.DEBUG;
    delete process.env.LOG_LEVEL;
    delete process.env.PERMISSIONS_FILE;
    delete process.env.DEV_MODE;

    const config = resolveConfig();

    expect(config.permissionsFile).toBe("./permissions.yaml");
    expect(config.logLevel).toBe("INFO");
    expect(config.debug).toBe(false);
    expect(config.devMode).toBe(false);
    expect(config.skipHealthChecks).toBe(false);
  });
});
