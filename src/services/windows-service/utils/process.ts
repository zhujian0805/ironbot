/**
 * Process Execution Utilities
 * Safe execution of external commands and credential handling
 */

import { execSync } from "child_process";
import type { ExecOptions, ExecResult } from "../types/index.ts";
import { logger } from "../../../utils/logging.ts";

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

    const cmdLine = `${command} ${args.map(arg => `"${arg}"`).join(" ")}`;
    const stdout = execSync(cmdLine, {
      encoding: "utf-8",
      timeout: options.timeout || 30000,
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    logger.debug({ command, exitCode: 0 }, "Command executed successfully");

    return {
      exitCode: 0,
      stdout: stdout || "",
      stderr: "",
      success: true
    };
  } catch (error) {
    const err = error as any;
    logger.error(
      {
        command,
        exitCode: err.status,
        stderr: err.stderr || err.message
      },
      "Command execution failed"
    );

    return {
      exitCode: err.status || 1,
      stdout: err.stdout ? err.stdout.toString() : "",
      stderr: err.stderr ? err.stderr.toString() : err.message || "",
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

    const cmdLine = `${command} ${args.map(arg => `"${arg}"`).join(" ")}`;
    const stdout = execSync(cmdLine, {
      encoding: "utf-8",
      timeout: options.timeout || 30000,
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env
    });

    logger.info(
      { command, username, exitCode: 0 },
      "Command executed with user context"
    );

    return {
      exitCode: 0,
      stdout: stdout || "",
      stderr: "",
      success: true
    };
  } catch (error) {
    const err = error as any;
    logger.error(
      {
        command,
        username,
        exitCode: err.status,
        stderr: err.stderr || err.message
      },
      "Credential-based command execution failed"
    );

    return {
      exitCode: err.status || 1,
      stdout: err.stdout ? err.stdout.toString() : "",
      stderr: err.stderr ? err.stderr.toString() : err.message || "",
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

    const stdout = execSync(`powershell.exe -NoProfile -Command "${scriptContent.replace(/"/g, '\\"')}"`, {
      encoding: "utf-8",
      timeout: options.timeout || 30000,
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env
    });

    logger.debug({ exitCode: 0 }, "PowerShell script executed successfully");

    return {
      exitCode: 0,
      stdout: stdout || "",
      stderr: "",
      success: true
    };
  } catch (error) {
    const err = error as any;
    logger.error(
      {
        exitCode: err.status,
        stderr: err.stderr || err.message
      },
      "PowerShell script execution failed"
    );

    return {
      exitCode: err.status || 1,
      stdout: err.stdout ? err.stdout.toString() : "",
      stderr: err.stderr ? err.stderr.toString() : err.message || "",
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

/**
 * Get Windows user account information
 * Returns domain and username in proper format
 */
export async function getUserAccountInfo(username: string): Promise<{
  domain: string;
  username: string;
  fullName: string;
}> {
  try {
    // Parse username to extract domain if present
    let domain = ".";  // Local account by default
    let user = username;

    if (username.includes("\\")) {
      const parts = username.split("\\");
      domain = parts[0];
      user = parts[1];
    }

    // Verify user exists
    const exists = await userAccountExists(username);
    if (!exists) {
      throw new Error(`User account '${username}' not found`);
    }

    logger.debug(
      { username, domain, user },
      "User account info retrieved"
    );

    return {
      domain,
      username: user,
      fullName: `${domain}\\${user}`
    };
  } catch (error) {
    logger.error({ username, error }, "Failed to get user account info");
    throw error;
  }
}

