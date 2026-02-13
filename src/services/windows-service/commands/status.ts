/**
 * Status Command Implementation
 * Handles querying service status
 */

import { logger } from "../../../utils/logging.ts";
import type { ServiceStatus } from "../types/index.ts";
import { getServiceStatus as nssmGetStatus } from "../config/nssm.ts";
import { execSync } from "child_process";

/**
 * Exit codes for status command
 */
export enum StatusExitCode {
  ServiceRunning = 0,
  ServiceStopped = 1,
  QueryFailed = 2
}

/**
 * Get actual Windows service status using sc query
 */
async function getWindowsServiceStatus(
  serviceName: string
): Promise<ServiceStatus | null> {
  try {
    // Use sc query to get actual Windows service status
    const result = execSync(`sc query "${serviceName}"`, {
      encoding: "utf-8",
      timeout: 10000,
      windowsHide: true
    });

    // Parse the output
    const lines = result.split('\n');
    let state = 'unknown';
    let statusCode = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('STATE')) {
        // Extract state from format like: STATE              : 4  RUNNING
        const stateMatch = trimmed.match(/STATE\s*:\s*\d+\s+(\w+)/);
        if (stateMatch) {
          const stateStr = stateMatch[1].toUpperCase();
          switch (stateStr) {
            case 'RUNNING':
              state = 'running';
              break;
            case 'STOPPED':
              state = 'stopped';
              break;
            case 'PAUSED':
              state = 'paused';
              break;
            case 'START_PENDING':
              state = 'starting';
              break;
            case 'STOP_PENDING':
              state = 'stopping';
              break;
            default:
              state = 'unknown';
          }
        }
      }
    }

    // Also get startup type using sc qc
    let startType = 'auto';
    try {
      const qcResult = execSync(`sc qc "${serviceName}"`, {
        encoding: "utf-8",
        timeout: 5000,
        windowsHide: true
      });

      const qcLines = qcResult.split('\n');
      for (const line of qcLines) {
        if (line.includes('START_TYPE')) {
          if (line.includes('AUTO_START')) {
            startType = 'auto';
          } else if (line.includes('DEMAND_START')) {
            startType = 'manual';
          } else if (line.includes('DISABLED')) {
            startType = 'disabled';
          }
          break;
        }
      }
    } catch (error) {
      logger.warn({ serviceName }, "Failed to query service configuration");
    }

    return {
      serviceName,
      displayName: serviceName,
      state: state as ServiceStatus['state'],
      status: statusCode,
      processId: null, // We don't get PID from sc query easily
      startType,
      exitCode: null,
      uptime: null,
      lastStartTime: null,
      lastStopTime: null
    };
  } catch (error) {
    logger.warn({ serviceName, error }, "Failed to query Windows service status");
    return null;
  }
}

/**
 * Get service status - tries Windows status first, falls back to NSSM
 */
export async function getServiceStatus(
  serviceName: string = "IronBot"
): Promise<ServiceStatus | null> {
  try {
    logger.info({ serviceName }, "Querying service status");

    // Try Windows service status first (more reliable)
    const windowsStatus = await getWindowsServiceStatus(serviceName);
    if (windowsStatus) {
      logger.info(
        {
          serviceName,
          state: windowsStatus.state,
          source: 'windows'
        },
        "Service status retrieved from Windows"
      );
      return windowsStatus;
    }

    // Fallback to NSSM status if Windows query fails
    logger.warn({ serviceName }, "Windows status query failed, trying NSSM");
    const status = await nssmGetStatus(serviceName);

    if (status) {
      logger.info(
        {
          serviceName,
          state: status.state,
          processId: status.processId,
          source: 'nssm'
        },
        "Service status retrieved from NSSM"
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
