import { Command } from "commander";
import type { CliArgs } from "../config.js";

export const parseCliArgs = (argv: string[] = process.argv.slice(2)): CliArgs => {
  const program = new Command();

  program
    .option("--debug", "Enable debug logging")
    .option("--log-level <level>", "Override log level (DEBUG, INFO, WARNING, ERROR)")
    .option("--log-file <path>", "Optional file to write logs to")
    .option("--skip-health-checks", "Skip startup health checks")
    .option("--permissions-file <path>", "Path to permissions.yaml configuration file");

  program.parse(argv, { from: "user" });

  const options = program.opts();

  return {
    debug: options.debug,
    logLevel: options.logLevel,
    logFile: options.logFile,
    skipHealthChecks: options.skipHealthChecks,
    permissionsFile: options.permissionsFile
  };
};
