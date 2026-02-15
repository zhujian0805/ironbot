import { Command } from "commander";
import type { CliArgs } from "../config.ts";
import { createWindowsServiceCommands } from "./windows-service-cli.ts";

export interface ParsedCliArgs extends CliArgs {
  isServiceCommand: boolean;
}

export const parseCliArgs = (argv: string[] = process.argv.slice(2)): ParsedCliArgs => {
  // Check if this is a service command first
  const isServiceCommand = argv.some((arg, i) => {
    return (arg === 'windows-service' || arg === 'service') && i === 0;
  });

  const program = new Command();

  // Main bot options
  program
    .option("--debug", "Enable debug logging")
    .option("--log-level <level>", "Override log level (DEBUG, INFO, WARNING, ERROR)")
    .option("--log-file <path>", "Optional file to write logs to")
    .option("--skip-health-checks", "Skip startup health checks")
    .option("--permissions-file <path>", "Path to permissions.yaml configuration file");

  // Only add windows-service commands if this is actually a service command
  // This prevents the command handlers from being invoked during flag parsing
  if (isServiceCommand) {
    createWindowsServiceCommands(program);
  }

  // Don't show help for unknown commands - just continue with the bot
  program.showHelpAfterError = false;
  program.exitOverride();

  // Only parse if we have actual arguments, otherwise return defaults
  if (argv.length === 0) {
    return {
      debug: undefined,
      logLevel: undefined,
      logFile: undefined,
      skipHealthChecks: undefined,
      permissionsFile: undefined,
      isServiceCommand: false
    };
  }

  // If we have arguments, parse them
  try {
    program.parse(argv, { from: "user" });
  } catch (error) {
    // If parsing fails, return defaults
    // This can happen if service commands are malformed or other parsing issues
    return {
      debug: undefined,
      logLevel: undefined,
      logFile: undefined,
      skipHealthChecks: undefined,
      permissionsFile: undefined,
      isServiceCommand
    };
  }

  const options = program.opts();

  return {
    debug: options.debug || undefined,
    logLevel: options.logLevel,
    logFile: options.logFile,
    skipHealthChecks: options.skipHealthChecks || undefined,
    permissionsFile: options.permissionsFile,
    isServiceCommand
  };
};



