/**
 * Install Command Implementation
 * Handles installation of IronBot as a Windows service
 */

import { logger } from "../../../utils/logging.ts";
import { join } from "path";
import type { InstallOptions, InstallResult } from "../types/index.ts";
import {
  buildServiceConfig,
  validateServiceConfig,
  formatValidationReport,
  validateEnvironmentVariableAccess
} from "../config/service-config.ts";
import {
  installService as nssmInstall,
  setServiceAppDirectory,
  setServiceLogging,
  setServiceUser,
  setServiceStartupType,
  setServiceAutoRestart,
  removeService as nssmRemove
} from "../config/nssm.ts";
import { getLogsDirectory, createLogDirectory } from "../utils/paths.ts";
import { hasAdminPrivileges } from "../utils/process.ts";

/**
 * Exit codes for install command
 */
export enum InstallExitCode {
  Success = 0,
  GeneralError = 1,
  AdminRequired = 2,
  NssmNotFound = 3,
  UserNotFound = 4,
  ServiceExists = 5,
  PathInvalid = 6
}

/**
 * Install IronBot as a Windows service
 */
export async function installService(options: InstallOptions): Promise<InstallResult> {
  logger.info(
    {
      serviceName: options.serviceName || "IronBot",
      startupType: options.startupType || "auto",
      force: options.force || false
    },
    "Starting service installation"
  );

  try {
    // Check admin privileges first
    const isAdmin = await hasAdminPrivileges();
    if (!isAdmin) {
      logger.error("Admin privileges required");
      throw {
        code: InstallExitCode.AdminRequired,
        message: "Admin privileges required to install service"
      };
    }

    // Build service configuration
    const config = await buildServiceConfig(options);
    logger.debug({ serviceName: config.serviceName }, "Service configuration built");

    // Validate configuration
    const validation = await validateServiceConfig(config);
    logger.debug({ valid: validation.valid, checks: validation.checks.length }, "Configuration validation complete");

    if (!validation.valid && !options.skipValidation) {
      logger.error({ errors: validation.errors }, "Configuration validation failed");
      console.error(formatValidationReport(validation));

      throw {
        code: InstallExitCode.PathInvalid,
        message: `Configuration validation failed: ${validation.errors.join("; ")}`
      };
    }

    if (validation.warnings.length > 0) {
      logger.warn({ warnings: validation.warnings }, "Configuration warnings");
      console.warn("⚠ Warnings during validation:");
      validation.warnings.forEach((w: string) => console.warn(`  • ${w}`));
    }

    // Validate user context and environment variables
    if (config.username) {
      logger.info({ username: config.username }, "Validating user context and environment");
      const envValidation = await validateEnvironmentVariableAccess(config.username);

      if (!envValidation.valid && !options.skipValidation) {
        logger.error({ errors: envValidation.errors }, "User environment validation failed");
        console.error("\n✗ User Environment Validation Failed");
        envValidation.errors.forEach((e: string) => console.error(`  • ${e}`));
      } else if (envValidation.warnings.length > 0) {
        logger.warn({ warnings: envValidation.warnings }, "User environment warnings");
        console.warn("\n⚠ User Environment Warnings:");
        envValidation.warnings.forEach((w: string) => console.warn(`  • ${w}`));
        console.warn(`\nEnsure the following variables are set in ${config.username}'s environment:`);
        envValidation.warnings.forEach((w: string) => {
          const varName = w.split(" ")[0];
          console.warn(`  • ${varName}`);
        });
      }

      logger.info(
        {
          username: config.username,
          checksPerformed: envValidation.checks.length,
          warningsFound: envValidation.warnings.length
        },
        "User context and environment validation complete"
      );
    }

    // If service already exists and --force is not set, fail
    const serviceExists = validation.checks.find((c: any) => c.name === 'service-name-unique');
    if (serviceExists?.status === 'warn' && !options.force) {
      logger.error({ serviceName: config.serviceName }, "Service already exists, use --force to replace");
      throw {
        code: InstallExitCode.ServiceExists,
        message: `Service '${config.serviceName}' already exists. Use --force to uninstall and reinstall.`
      };
    }

    // If service exists and --force is set, uninstall first
    if (serviceExists?.status === 'warn' && options.force) {
      logger.info({ serviceName: config.serviceName }, "Uninstalling existing service");
      const uninstallResult = await nssmRemove(config.serviceName, true);
      if (!uninstallResult) {
        logger.error("Failed to uninstall existing service");
        throw {
          code: InstallExitCode.GeneralError,
          message: "Failed to uninstall existing service"
        };
      }
      logger.info("Existing service uninstalled");
    }

    // Install the service with NSSM
    // Resolve the path to main.ts from the current working directory
    const projectRoot = process.cwd();
    const mainTsPath = join(projectRoot, "src", "main.ts");

    const installResult = await nssmInstall(config.serviceName, process.execPath, [
      mainTsPath
    ]);

    if (!installResult) {
      logger.error("NSSM service installation failed");
      throw {
        code: InstallExitCode.GeneralError,
        message: "Failed to install service via NSSM"
      };
    }

    logger.info({ serviceName: config.serviceName }, "Service installed via NSSM");

    // Create log directory
    const logDirCreated = await createLogDirectory(config.workingDirectory);
    if (!logDirCreated) {
      logger.warn({ workingDirectory: config.workingDirectory }, "Failed to create log directory");
      // Continue despite this warning
    }

    // Configure working directory
    const appDirResult = await setServiceAppDirectory(
      config.serviceName,
      config.workingDirectory
    );

    if (!appDirResult) {
      logger.error("Failed to set working directory");
      // Continue despite this error
    }

    // Configure logging
    const logsDir = getLogsDirectory(config.workingDirectory);
    const logsResult = await setServiceLogging(config.serviceName, config.logPath);

    if (!logsResult) {
      logger.warn("Failed to configure logging");
      // Continue despite this error
    }

    // Configure user account
    if (config.username && config.password) {
      const userResult = await setServiceUser(
        config.serviceName,
        config.username,
        config.password
      );

      if (!userResult) {
        logger.error("Failed to set service user");
        throw {
          code: InstallExitCode.UserNotFound,
          message: "Failed to configure service user account"
        };
      }
    }

    // Configure startup type
    const startupResult = await setServiceStartupType(
      config.serviceName,
      config.startupType
    );

    if (!startupResult) {
      logger.error("Failed to set startup type");
      // Continue despite this error
    }

    // Configure auto-restart
    if (config.autoRestart) {
      const restartResult = await setServiceAutoRestart(
        config.serviceName,
        true,
        config.restartDelaySeconds * 1000
      );

      if (!restartResult) {
        logger.warn("Failed to configure auto-restart");
        // Continue despite this error
      }
    }

    logger.info(
      {
        serviceName: config.serviceName,
        displayName: config.displayName,
        username: config.username,
        workingDirectory: config.workingDirectory,
        startupType: config.startupType,
        logPath: config.logPath
      },
      "Service installation complete"
    );

    return {
      success: true,
      serviceName: config.serviceName,
      displayName: config.displayName,
      username: config.username,
      workingDirectory: config.workingDirectory,
      startupType: config.startupType,
      logPath: config.logPath,
      message: `Service '${config.serviceName}' installed successfully. Use 'net start ${config.serviceName}' to start.`
    };
  } catch (error) {
    const err = error as any;
    const message = err.message || String(error);
    const code = err.code || InstallExitCode.GeneralError;

    logger.error({ error: message, code }, "Service installation failed");
    throw { code, message };
  }
}

/**
 * Handle install command from CLI
 */
export async function handleInstallCommand(options: any): Promise<void> {
  try {
    const result = await installService({
      serviceName: options.serviceName,
      startupType: options.startupType,
      autoRestart: options.autoRestart !== false,
      username: options.username,
      password: options.password,
      force: options.force,
      skipValidation: options.skipValidation,
      json: options.json
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("\n✓ Service Installation Successful\n");
      console.log(`  Service Name: ${result.serviceName}`);
      console.log(`  Display Name: ${result.displayName}`);
      console.log(`  User Account: ${result.username}`);
      console.log(`  Working Directory: ${result.workingDirectory}`);
      console.log(`  Auto-Start: ${result.startupType === 'auto' ? 'Enabled' : 'Disabled'}`);
      console.log(`  Log Path: ${result.logPath}`);
      console.log(`\n${result.message}\n`);
    }

    process.exit(0);
  } catch (error) {
    const err = error as any;
    const code = err.code || InstallExitCode.GeneralError;
    const message = err.message || String(error);

    if (options.json) {
      console.error(JSON.stringify({
        success: false,
        error: message,
        code
      }, null, 2));
    } else {
      console.error(`\n✗ Installation Failed\n`);
      console.error(`  Error: ${message}\n`);
    }

    process.exit(code);
  }
}
