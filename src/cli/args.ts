import { Command } from "commander";
import type { CliArgs } from "../config.ts";
import { createWindowsServiceCommands } from "./windows-service-cli.ts";

export const parseCliArgs = (argv: string[] = process.argv.slice(2)): CliArgs => {
  const program = new Command();

  // Add windows-service command group
  createWindowsServiceCommands(program);

  // Main bot options
  program
    .option("--debug", "Enable debug logging")
    .option("--log-level <level>", "Override log level (DEBUG, INFO, WARNING, ERROR)")
    .option("--log-file <path>", "Optional file to write logs to")
    .option("--skip-health-checks", "Skip startup health checks")
    .option("--permissions-file <path>", "Path to permissions.yaml configuration file");

  // Don't show help for unknown commands - just continue with the bot
  program.showHelpAfterError = false;

  // Only parse if we have actual arguments, otherwise return defaults
  if (argv.length === 0) {
    return {
      debug: false,
      logLevel: undefined,
      logFile: undefined,
      skipHealthChecks: false,
      permissionsFile: undefined
    };
  }

  // If we have arguments, parse them
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



