/**
 * Status Command Implementation
 * Handles querying service status
 */

import { logger } from "../../utils/logging.ts";
import type { ServiceStatus } from "../types/index.js";
import { getServiceStatus as nssmGetStatus } from "../config/nssm.js";

/**
 * Exit codes for status command
 */
export enum StatusExitCode {
  ServiceRunning = 0,
  ServiceStopped = 1,
  QueryFailed = 2
}

/**
 * Get service status
 */
export async function getServiceStatus(
  serviceName: string = "IronBot"
): Promise<ServiceStatus | null> {
  try {
    logger.info({ serviceName }, "Querying service status");

    const status = await nssmGetStatus(serviceName);

    if (status) {
      logger.info(
        {
          serviceName,
          state: status.state,
          processId: status.processId
        },
        "Service status retrieved"
      );
      return status;
    } else {
      logger.warn({ serviceName }, "Failed to query service status");
      return null;
    }
  } catch (error) {
    logger.error(
      { serviceName, error },
      "Error querying service status"
    );
    return null;
  }
}

/**
 * Format status for human-readable output
 */
export function formatStatusOutput(status: ServiceStatus): string {
  const lines: string[] = [];

  lines.push(`\nService: ${status.serviceName}`);
  lines.push(`Status: ${status.state.toUpperCase()}`);

  if (status.processId) {
    lines.push(`PID: ${status.processId}`);
  }

  if (status.uptime !== null && status.uptime > 0) {
    const hours = Math.floor(status.uptime / 3600000);
    const minutes = Math.floor((status.uptime % 3600000) / 60000);
    const seconds = Math.floor((status.uptime % 60000) / 1000);
    lines.push(`Uptime: ${hours}h ${minutes}m ${seconds}s`);
  }

  if (status.lastStartTime) {
    lines.push(`Last started: ${status.lastStartTime.toISOString()}`);
  }

  lines.push(`Startup type: ${status.startType}`);

  return lines.join("\n");
}

/**
 * Handle status command from CLI
 */
export async function handleStatusCommand(
  serviceName: string | undefined,
  options: any
): Promise<void> {
  try {
    const name = serviceName || "IronBot";
    const status = await getServiceStatus(name);

    if (!status) {
      if (options.json) {
        console.error(JSON.stringify({
          success: false,
          error: `Service '${name}' not found or status could not be retrieved`
        }, null, 2));
      } else {
        console.error(`\n✗ Service '${name}' not found or status could not be retrieved\n`);
      }
      process.exit(StatusExitCode.QueryFailed);
    }

    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(formatStatusOutput(status));
      console.log("");
    }

    // Exit with appropriate code based on status
    if (status.state === "running") {
      process.exit(StatusExitCode.ServiceRunning);
    } else {
      process.exit(StatusExitCode.ServiceStopped);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (options.json) {
      console.error(JSON.stringify({
        success: false,
        error: message
      }, null, 2));
    } else {
      console.error(`\n✗ Status Query Failed\n  Error: ${message}\n`);
    }

    process.exit(StatusExitCode.QueryFailed);
  }
}
