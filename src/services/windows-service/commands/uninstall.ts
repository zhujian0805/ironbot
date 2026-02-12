/**
 * Uninstall Command Implementation
 * Handles removal of IronBot Windows service
 */

import { logger } from "../../utils/logging.ts";
import type { UninstallResult } from "../types/index.js";
import { removeService } from "../config/nssm.js";
import { serviceExists } from "../utils/process.js";

/**
 * Exit codes for uninstall command
 */
export enum UninstallExitCode {
  Success = 0,
  GeneralError = 1,
  AdminRequired = 2,
  ServiceNotFound = 3,
  ServiceRunning = 4
}

/**
 * Uninstall IronBot service
 */
export async function uninstallService(
  serviceName: string = "IronBot",
  force: boolean = false
): Promise<UninstallResult> {
  logger.info({ serviceName, force }, "Starting service uninstallation");

  try {
    // Check if service exists
    const exists = await serviceExists(serviceName);
    if (!exists) {
      logger.error({ serviceName }, "Service not found");
      throw {
        code: UninstallExitCode.ServiceNotFound,
        message: `Service '${serviceName}' not found`
      };
    }

    // Remove the service
    const result = await removeService(serviceName, force);
    if (!result) {
      logger.error({ serviceName }, "Failed to remove service");
      throw {
        code: UninstallExitCode.GeneralError,
        message: `Failed to remove service '${serviceName}'`
      };
    }

    logger.info({ serviceName }, "Service uninstalled successfully");

    return {
      success: true,
      serviceName,
      message: `Service '${serviceName}' uninstalled successfully.`
    };
  } catch (error) {
    const err = error as any;
    const message = err.message || String(error);
    const code = err.code || UninstallExitCode.GeneralError;

    logger.error({ error: message, code }, "Service uninstallation failed");
    throw { code, message };
  }
}

/**
 * Handle uninstall command from CLI
 */
export async function handleUninstallCommand(
  serviceName: string | undefined,
  options: any
): Promise<void> {
  try {
    const result = await uninstallService(
      serviceName || "IronBot",
      options.force || false
    );

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("\n✓ Service Uninstallation Successful\n");
      console.log(`  ${result.message}\n`);
    }

    process.exit(0);
  } catch (error) {
    const err = error as any;
    const code = err.code || UninstallExitCode.GeneralError;
    const message = err.message || String(error);

    if (options.json) {
      console.error(JSON.stringify({
        success: false,
        error: message,
        code
      }, null, 2));
    } else {
      console.error(`\n✗ Uninstallation Failed\n`);
      console.error(`  Error: ${message}\n`);
    }

    process.exit(code);
  }
}
