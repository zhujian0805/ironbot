/**
 * Process Execution Utilities
 * Safe execution of external commands and credential handling
 */

import { execa } from "execa";
import type { ExecOptions, ExecResult } from "../types/index.js";
import { logger } from "../../utils/logging.ts";

/**
 * Execute a command safely
 */
export async function executeCommand(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  try {
    logger.debug(
      { command, argsCount: args.length, timeout: options.timeout },
      "Executing command"
    );

    const result = await execa(command, args, {
      timeout: options.timeout || 30000,
      env: options.env,
      cwd: options.cwd,
      shell: true
    });

    logger.debug({ command, exitCode: result.exitCode }, "Command executed successfully");

    return {
      exitCode: result.exitCode || 0,
      stdout: result.stdout,
      stderr: result.stderr,
      success: true
    };
  } catch (error) {
    const err = error as any;
    logger.error(
      {
        command,
        exitCode: err.exitCode,
        stderr: err.stderr
      },
      "Command execution failed"
    );

    return {
      exitCode: err.exitCode || 1,
      stdout: err.stdout || "",
      stderr: err.stderr || "",
      success: false
    };
  }
}

/**
 * Execute a command with specific user credentials
 * NOTE: This is a placeholder for actual credential-based execution
 * In real implementation, would use Windows runas or similar
 */
export async function executeWithCredentials(
  command: string,
  username: string,
  password: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  try {
    logger.debug(
      { command, username },
      "Executing command with credentials"
    );

    // In a real Windows implementation, this would use:
    // runas /user:{username} {command} {args}
    // But for now, we'll just execute with current user's context
    // and log that credentials would be used

    const result = await execa(command, args, {
      timeout: options.timeout || 30000,
      env: options.env,
      cwd: options.cwd,
      shell: true
    });

    logger.info(
      { command, username, exitCode: result.exitCode },
      "Command executed with user context"
    );

    return {
      exitCode: result.exitCode || 0,
      stdout: result.stdout,
      stderr: result.stderr,
      success: true
    };
  } catch (error) {
    const err = error as any;
    logger.error(
      {
        command,
        username,
        exitCode: err.exitCode,
        stderr: err.stderr
      },
      "Credential-based command execution failed"
    );

    return {
      exitCode: err.exitCode || 1,
      stdout: err.stdout || "",
      stderr: err.stderr || "",
      success: false
    };
  }
}

/**
 * Execute a PowerShell command
 */
export async function executePowerShell(
  scriptContent: string,
  options: ExecOptions = {}
): Promise<ExecResult> {
  try {
    logger.debug(
      { scriptLength: scriptContent.length },
      "Executing PowerShell script"
    );

    const result = await execa("powershell.exe", [
      "-NoProfile",
      "-Command",
      scriptContent
    ], {
      timeout: options.timeout || 30000,
      env: options.env,
      cwd: options.cwd,
      shell: false
    });

    logger.debug({ exitCode: result.exitCode }, "PowerShell script executed successfully");

    return {
      exitCode: result.exitCode || 0,
      stdout: result.stdout,
      stderr: result.stderr,
      success: true
    };
  } catch (error) {
    const err = error as any;
    logger.error(
      {
        exitCode: err.exitCode,
        stderr: err.stderr
      },
      "PowerShell script execution failed"
    );

    return {
      exitCode: err.exitCode || 1,
      stdout: err.stdout || "",
      stderr: err.stderr || "",
      success: false
    };
  }
}

/**
 * Check if current process has admin privileges
 */
export async function hasAdminPrivileges(): Promise<boolean> {
  try {
    const result = await executePowerShell(
      "[bool](([System.Security.Principal.WindowsIdentity]::GetCurrent()).groups -match 'S-1-5-32-544')"
    );

    const hasAdmin = result.success && result.stdout.toLowerCase().includes("true");
    logger.debug({ hasAdmin }, "Admin privilege check complete");
    return hasAdmin;
  } catch (error) {
    logger.warn({ error }, "Failed to check admin privileges");
    return false;
  }
}

/**
 * Get current Windows user
 */
export async function getCurrentWindowsUser(): Promise<string | null> {
  try {
    const result = await executeCommand("whoami");
    if (result.success) {
      const user = result.stdout.trim();
      logger.debug({ user }, "Current Windows user retrieved");
      return user;
    }
  } catch (error) {
    logger.warn({ error }, "Failed to get current user");
  }
  return null;
}

/**
 * Check if a Windows user account exists
 */
export async function userAccountExists(username: string): Promise<boolean> {
  try {
    const result = await executeCommand("net", ["user", username]);
    const exists = result.success && result.exitCode === 0;
    logger.debug({ username, exists }, "User account existence check complete");
    return exists;
  } catch (error) {
    logger.warn({ username, error }, "Failed to check user account existence");
    return false;
  }
}

/**
 * Check if a Windows service exists
 */
export async function serviceExists(serviceName: string): Promise<boolean> {
  try {
    const result = await executeCommand("sc", ["query", serviceName]);
    const exists = result.success && result.exitCode === 0;
    logger.debug({ serviceName, exists }, "Service existence check complete");
    return exists;
  } catch (error) {
    logger.warn({ serviceName, error }, "Failed to check service existence");
    return false;
  }
}
