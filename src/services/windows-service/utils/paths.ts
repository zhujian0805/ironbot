/**
 * Path Utilities for Windows Service Wrapper
 * Handles project path resolution and validation
 */

import { existsSync, accessSync, constants } from "fs";
import { resolve, isAbsolute } from "path";
import { logger } from "../../utils/logging.js";

/**
 * Resolve the absolute path to IronBot project folder
 */
export function resolveProjectPath(inputPath?: string): string {
  let projectPath: string;

  if (inputPath) {
    // If input path provided, use it
    projectPath = isAbsolute(inputPath) ? inputPath : resolve(process.cwd(), inputPath);
  } else {
    // Default to current working directory
    projectPath = process.cwd();
  }

  logger.debug({ projectPath }, "Project path resolved");
  return projectPath;
}

/**
 * Validate that a path is accessible and readable
 */
export async function validatePathAccessibility(path: string): Promise<boolean> {
  try {
    // Check if path exists
    if (!existsSync(path)) {
      logger.warn({ path }, "Path does not exist");
      return false;
    }

    // Check if we have read access
    accessSync(path, constants.R_OK);
    logger.debug({ path }, "Path is accessible and readable");
    return true;
  } catch (error) {
    logger.warn({ path, error }, "Path accessibility check failed");
    return false;
  }
}

/**
 * Get log path for service
 * Convention: {projectPath}/logs/service.log
 */
export function getLogPath(projectPath: string): string {
  return resolve(projectPath, "logs", "service.log");
}

/**
 * Get logs directory path
 */
export function getLogsDirectory(projectPath: string): string {
  return resolve(projectPath, "logs");
}

/**
 * Validate that project directory contains expected files
 */
export function validateProjectStructure(projectPath: string): {
  valid: boolean;
  missingFiles: string[];
} {
  const expectedFiles = [
    "package.json",
    "tsconfig.json",
    "src"
  ];

  const missingFiles = expectedFiles.filter(file => {
    const fullPath = resolve(projectPath, file);
    return !existsSync(fullPath);
  });

  return {
    valid: missingFiles.length === 0,
    missingFiles
  };
}

/**
 * Resolve configuration file path
 */
export function resolveConfigFilePath(
  projectPath: string,
  filename: string
): string {
  return resolve(projectPath, filename);
}

/**
 * Check if configuration file exists
 */
export function configFileExists(projectPath: string, filename: string): boolean {
  const filePath = resolveConfigFilePath(projectPath, filename);
  return existsSync(filePath);
}

/**
 * Format path for Windows (escape backslashes if needed)
 */
export function formatWindowsPath(path: string): string {
  return path.replace(/\//g, "\\");
}

/**
 * Normalize path (make it absolute if relative)
 */
export function normalizePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

/**
 * Create log directory if it doesn't exist
 */
export async function createLogDirectory(projectPath: string): Promise<boolean> {
  try {
    const logsDir = getLogsDirectory(projectPath);

    // Check if directory exists
    if (!existsSync(logsDir)) {
      // Create the directory using Windows command
      const { execSync } = require("child_process");
      try {
        // Try using mkdir for Windows (cmd.exe)
        execSync(`if not exist "${logsDir}" mkdir "${logsDir}"`, {
          stdio: "ignore",
          shell: true
        });
      } catch {
        // Fallback: Try PowerShell
        execSync(`powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Path '${logsDir}' -Force | Out-Null"`, {
          stdio: "ignore"
        });
      }
      logger.info({ logsDir }, "Log directory created");
    } else {
      logger.debug({ logsDir }, "Log directory already exists");
    }

    // Verify we can write to it
    try {
      accessSync(logsDir, constants.W_OK);
      logger.debug({ logsDir }, "Log directory is writable");
      return true;
    } catch {
      logger.warn({ logsDir }, "Log directory exists but not writable");
      return false;
    }
  } catch (error) {
    logger.error({ projectPath, error }, "Failed to create log directory");
    return false;
  }
}
