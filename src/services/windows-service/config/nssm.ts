/**
 * NSSM (Non-Sucking Service Manager) Command Wrapper
 * Provides safe execution of NSSM commands for Windows service management
 */

import { execa } from "execa";
import type { CommandResult, ServiceStatus } from "../types/index.js";
import { logger } from "../../utils/logging.ts";

/**
 * Execute an NSSM command safely
 */
export async function executeNssmCommand(
  command: string,
  args: string[] = []
): Promise<CommandResult> {
  try {
    const fullArgs = [command, ...args];
    logger.debug({ command, argsCount: args.length }, "Executing NSSM command");

    const result = await execa("nssm", fullArgs);

    return {
      statusCode: result.exitCode || 0,
      stdout: result.stdout,
      stderr: result.stderr,
      success: true
    };
  } catch (error) {
    const err = error as any;
    logger.error(
      {
        command,
        statusCode: err.exitCode,
        stderr: err.stderr
      },
      "NSSM command failed"
    );

    return {
      statusCode: err.exitCode || 1,
      stdout: err.stdout || "",
      stderr: err.stderr || "",
      success: false
    };
  }
}

/**
 * Install a service using NSSM
 * Usage: nssm install <serviceName> <application> [<arguments>]
 */
export async function installService(
  serviceName: string,
  applicationPath: string,
  appArguments: string[] = []
): Promise<boolean> {
  const args = [serviceName, applicationPath, ...appArguments];
  const result = await executeNssmCommand("install", args);

  if (result.success) {
    logger.info({ serviceName, applicationPath }, "Service installed successfully");
    return true;
  } else {
    logger.error({ serviceName, stderr: result.stderr }, "Failed to install service");
    return false;
  }
}

/**
 * Set service application directory (working directory)
 * Usage: nssm set <serviceName> AppDirectory <path>
 */
export async function setServiceAppDirectory(
  serviceName: string,
  directoryPath: string
): Promise<boolean> {
  const result = await executeNssmCommand("set", [
    serviceName,
    "AppDirectory",
    directoryPath
  ]);

  if (result.success) {
    logger.info({ serviceName, directoryPath }, "Service working directory set");
    return true;
  } else {
    logger.error({ serviceName, stderr: result.stderr }, "Failed to set working directory");
    return false;
  }
}

/**
 * Set service logging configuration
 * Usage: nssm set <serviceName> AppStdout <path>
 *        nssm set <serviceName> AppStderr <path>
 */
export async function setServiceLogging(
  serviceName: string,
  logPath: string
): Promise<boolean> {
  // Set both stdout and stderr to the same log file
  const stdoutResult = await executeNssmCommand("set", [
    serviceName,
    "AppStdout",
    logPath
  ]);

  const stderrResult = await executeNssmCommand("set", [
    serviceName,
    "AppStderr",
    logPath
  ]);

  if (stdoutResult.success && stderrResult.success) {
    logger.info({ serviceName, logPath }, "Service logging configured");
    return true;
  } else {
    logger.error({ serviceName }, "Failed to configure logging");
    return false;
  }
}

/**
 * Set service user account and credentials
 * Usage: nssm set <serviceName> ObjectName <domain>\<user> <password>
 */
export async function setServiceUser(
  serviceName: string,
  username: string,
  password: string
): Promise<boolean> {
  const result = await executeNssmCommand("set", [
    serviceName,
    "ObjectName",
    username,
    password
  ]);

  if (result.success) {
    logger.info({ serviceName, username }, "Service user configured");
    return true;
  } else {
    logger.error({ serviceName, stderr: result.stderr }, "Failed to set service user");
    return false;
  }
}

/**
 * Set service startup type
 * Usage: nssm set <serviceName> Start <auto|manual|disabled>
 */
export async function setServiceStartupType(
  serviceName: string,
  startupType: 'auto' | 'manual' | 'disabled'
): Promise<boolean> {
  const nssStartupType = {
    'auto': 'SERVICE_AUTO_START',
    'manual': 'SERVICE_DEMAND_START',
    'disabled': 'SERVICE_DISABLED'
  }[startupType];

  const result = await executeNssmCommand("set", [
    serviceName,
    "Start",
    nssStartupType
  ]);

  if (result.success) {
    logger.info({ serviceName, startupType }, "Service startup type set");
    return true;
  } else {
    logger.error({ serviceName, stderr: result.stderr }, "Failed to set startup type");
    return false;
  }
}

/**
 * Set service auto-restart on failure
 * Usage: nssm set <serviceName> AppRestart Always
 *        nssm set <serviceName> AppRestartDelay <milliseconds>
 */
export async function setServiceAutoRestart(
  serviceName: string,
  enabled: boolean,
  delayMs: number = 3000
): Promise<boolean> {
  if (enabled) {
    const restartResult = await executeNssmCommand("set", [
      serviceName,
      "AppRestart",
      "Always"
    ]);

    const delayResult = await executeNssmCommand("set", [
      serviceName,
      "AppRestartDelay",
      String(delayMs)
    ]);

    if (restartResult.success && delayResult.success) {
      logger.info({ serviceName, delayMs }, "Service auto-restart enabled");
      return true;
    } else {
      logger.error({ serviceName }, "Failed to enable auto-restart");
      return false;
    }
  } else {
    const result = await executeNssmCommand("set", [
      serviceName,
      "AppRestart",
      "Exit"
    ]);

    if (result.success) {
      logger.info({ serviceName }, "Service auto-restart disabled");
      return true;
    } else {
      logger.error({ serviceName }, "Failed to disable auto-restart");
      return false;
    }
  }
}

/**
 * Get service status
 * Usage: nssm status <serviceName>
 */
export async function getServiceStatus(
  serviceName: string
): Promise<ServiceStatus | null> {
  const result = await executeNssmCommand("status", [serviceName]);

  if (!result.success) {
    logger.warn({ serviceName }, "Failed to query service status");
    return null;
  }

  return parseNssmStatus(result.stdout, serviceName);
}

/**
 * Parse NSSM status output into ServiceStatus
 */
export function parseNssmStatus(
  nssmOutput: string,
  serviceName: string
): ServiceStatus {
  const stateMap: Record<string, ServiceStatus['state']> = {
    'SERVICE_RUNNING': 'running',
    'SERVICE_STOPPED': 'stopped',
    'SERVICE_PAUSED': 'paused',
    'SERVICE_START_PENDING': 'starting',
    'SERVICE_STOP_PENDING': 'stopping',
    'SERVICE_CONTINUE_PENDING': 'starting',
    'SERVICE_PAUSE_PENDING': 'stopping'
  };

  // Extract status from output (format: "SERVICE_XXX")
  const statusMatch = nssmOutput.match(/SERVICE_\w+/);
  const statusStr = statusMatch ? statusMatch[0] : 'SERVICE_STOPPED';
  const state = stateMap[statusStr] || 'unknown';

  return {
    serviceName,
    displayName: serviceName,
    state,
    status: 0,
    processId: null,
    startType: 'auto',
    exitCode: null,
    uptime: null,
    lastStartTime: null,
    lastStopTime: null
  };
}

/**
 * Remove (uninstall) a service
 * Usage: nssm remove <serviceName> confirm
 */
export async function removeService(
  serviceName: string,
  force: boolean = false
): Promise<boolean> {
  const args = [serviceName, 'confirm'];
  const result = await executeNssmCommand("remove", args);

  if (result.success) {
    logger.info({ serviceName }, "Service removed successfully");
    return true;
  } else {
    logger.error({ serviceName, stderr: result.stderr }, "Failed to remove service");
    return false;
  }
}

/**
 * Check if NSSM is available
 */
export async function isNssmAvailable(): Promise<boolean> {
  try {
    const result = await execa("nssm", ["--version"]);
    return result.exitCode === 0;
  } catch {
    logger.warn("NSSM not found in PATH");
    return false;
  }
}

/**
 * Get NSSM version
 */
export async function getNssmVersion(): Promise<string | null> {
  try {
    const result = await execa("nssm", ["--version"]);
    if (result.exitCode === 0) {
      return result.stdout.trim();
    }
  } catch {
    logger.warn("Failed to get NSSM version");
  }
  return null;
}
