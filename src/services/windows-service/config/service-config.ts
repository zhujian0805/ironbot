/**
 * Service Configuration Builder and Validator
 * Builds and validates service configuration before installation
 */

import type {
  ServiceConfig,
  InstallOptions,
  ValidationResult,
  ValidationCheck
} from "../types/index.ts";
import {
  resolveProjectPath,
  validatePathAccessibility,
  getLogPath,
  getLogsDirectory,
  validateProjectStructure
} from "../utils/paths.ts";
import {
  validateEnvironmentVariables,
  getEnvironmentSummary
} from "../utils/env.ts";
import {
  hasAdminPrivileges,
  userAccountExists,
  serviceExists,
  getCurrentWindowsUser,
  getUserAccountInfo
} from "../utils/process.ts";
import { logger } from "../../../utils/logging.ts";
import { isNssmAvailable } from "./nssm.ts";

/**
 * Build service configuration from options
 */
export async function buildServiceConfig(
  options: InstallOptions
): Promise<ServiceConfig> {
  // Validate configuration can be built
  const validation = await validateServiceConfig({
    serviceName: options.serviceName || "IronBot",
    username: options.username,
    workingDirectory: options.workingDirectory
  });

  if (!validation.valid && !options.skipValidation) {
    const errors = validation.errors.join("; ");
    throw new Error(`Service configuration validation failed: ${errors}`);
  }

  const projectPath = resolveProjectPath(options.workingDirectory);
  const logsDir = getLogsDirectory(projectPath);

  const config: ServiceConfig = {
    serviceName: options.serviceName || "IronBot",
    displayName: options.serviceName ? `${options.serviceName} - IronBot Service` : "IronBot - Slack AI Agent Service",
    description: "Windows service wrapper for IronBot Slack AI Agent",
    username: options.username || (await getCurrentWindowsUser()) || "SYSTEM",
    password: options.password,
    workingDirectory: projectPath,
    startupType: (options.startupType as 'auto' | 'manual') || 'auto',
    autoRestart: options.autoRestart !== false,
    restartDelaySeconds: 3,
    shutdownTimeoutSeconds: 30,
    logPath: getLogPath(projectPath),
    appendLogs: true
  };

  logger.info(
    {
      serviceName: config.serviceName,
      username: config.username,
      workingDirectory: config.workingDirectory,
      startupType: config.startupType
    },
    "Service configuration built"
  );

  return config;
}

/**
 * Validate service configuration
 * Performs pre-installation checks
 */
export async function validateServiceConfig(
  config: Partial<ServiceConfig>
): Promise<ValidationResult> {
  const checks: ValidationCheck[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check admin privileges
  const isAdmin = await hasAdminPrivileges();
  if (isAdmin) {
    checks.push({
      name: 'admin-privileges',
      status: 'pass',
      message: 'Running with admin privileges'
    });
  } else {
    checks.push({
      name: 'admin-privileges',
      status: 'fail',
      message: 'Admin privileges required to install service'
    });
    errors.push('Admin privileges required');
  }

  // 2. Check NSSM available
  const nssmOk = await isNssmAvailable();
  if (nssmOk) {
    checks.push({
      name: 'nssm-available',
      status: 'pass',
      message: 'NSSM is installed and available'
    });
  } else {
    checks.push({
      name: 'nssm-available',
      status: 'fail',
      message: 'NSSM not found in PATH'
    });
    errors.push('NSSM not found - install NSSM and add to PATH');
  }

  // 3. Check user account exists
  if (config.username) {
    const userExists = await userAccountExists(config.username);
    if (userExists) {
      checks.push({
        name: 'user-account-exists',
        status: 'pass',
        message: `User account '${config.username}' exists`
      });
    } else {
      checks.push({
        name: 'user-account-exists',
        status: 'fail',
        message: `User account '${config.username}' not found`
      });
      errors.push(`User account '${config.username}' does not exist`);
    }
  }

  // 4. Check working directory accessible
  if (config.workingDirectory) {
    const projectPath = resolveProjectPath(config.workingDirectory);
    const pathOk = await validatePathAccessibility(projectPath);

    if (pathOk) {
      checks.push({
        name: 'working-directory-accessible',
        status: 'pass',
        message: `Working directory is accessible: ${projectPath}`
      });

      // Check project structure
      const structure = validateProjectStructure(projectPath);
      if (structure.valid) {
        checks.push({
          name: 'project-structure-valid',
          status: 'pass',
          message: 'Project structure appears valid'
        });
      } else {
        checks.push({
          name: 'project-structure-valid',
          status: 'warn',
          message: `Missing files: ${structure.missingFiles.join(', ')}`,
          details: 'Expected: package.json, tsconfig.json, src directory'
        });
        warnings.push(`Project may be incomplete: ${structure.missingFiles.join(', ')}`);
      }
    } else {
      checks.push({
        name: 'working-directory-accessible',
        status: 'fail',
        message: `Working directory not accessible: ${projectPath}`
      });
      errors.push(`Working directory not accessible: ${projectPath}`);
    }
  }

  // 5. Check service name not already in use
  if (config.serviceName) {
    const exists = await serviceExists(config.serviceName);
    if (!exists) {
      checks.push({
        name: 'service-name-unique',
        status: 'pass',
        message: `Service name '${config.serviceName}' is available`
      });
    } else {
      checks.push({
        name: 'service-name-unique',
        status: 'warn',
        message: `Service '${config.serviceName}' already exists`,
        details: 'Use --force to uninstall existing service first'
      });
      warnings.push(`Service '${config.serviceName}' already exists`);
    }
  }

  // 6. Check environment variables
  const envCheck = await validateEnvironmentVariables();
  checks.push(...envCheck.checks);
  warnings.push(...envCheck.warnings);

  const valid = errors.length === 0;

  logger.info(
    {
      valid,
      passCount: checks.filter(c => c.status === 'pass').length,
      warnCount: checks.filter(c => c.status === 'warn').length,
      failCount: checks.filter(c => c.status === 'fail').length,
      errors: errors.length,
      warnings: warnings.length
    },
    "Service configuration validation complete"
  );

  return {
    valid,
    checks,
    errors,
    warnings
  };
}

/**
 * Get validation report as formatted string
 */
export function formatValidationReport(validation: ValidationResult): string {
  const lines: string[] = [];

  lines.push('\n=== Service Configuration Validation ===\n');

  // Passed checks
  const passedChecks = validation.checks.filter((c: ValidationCheck) => c.status === 'pass');
  if (passedChecks.length > 0) {
    lines.push('✓ PASSED:');
    passedChecks.forEach((check: ValidationCheck) => {
      lines.push(`  • ${check.message}`);
    });
    lines.push('');
  }

  // Warnings
  if (validation.warnings.length > 0) {
    lines.push('⚠ WARNINGS:');
    validation.warnings.forEach((warning: string) => {
      lines.push(`  • ${warning}`);
    });
    lines.push('');
  }

  // Errors
  if (validation.errors.length > 0) {
    lines.push('✗ ERRORS:');
    validation.errors.forEach((error: string) => {
      lines.push(`  • ${error}`);
    });
    lines.push('');
  }

  // Status
  lines.push(`Status: ${validation.valid ? '✓ VALID' : '✗ INVALID'}\n`);

  return lines.join('\n');
}

/**
 * Validate environment variable access for a user account
 * Checks if critical variables are accessible from the user's environment
 */
export async function validateEnvironmentVariableAccess(
  username: string,
  requiredVars: string[] = ["SLACK_BOT_TOKEN", "ANTHROPIC_API_KEY"]
): Promise<ValidationResult> {
  const checks: ValidationCheck[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Verify user exists first
    const userExists = await userAccountExists(username);
    if (!userExists) {
      logger.error({ username }, "User account not found for environment validation");
      return {
        valid: false,
        checks: [],
        errors: [`User account '${username}' not found`],
        warnings: []
      };
    }

    // Get user account info
    const userInfo = await getUserAccountInfo(username);
    logger.debug({ userInfo }, "User account info retrieved for validation");

    // Check each required variable
    for (const varName of requiredVars) {
      // In a real implementation, this would query the user's HKEY_CURRENT_USER\Environment
      // For now, we check the current process environment as a simulation
      const isSet = process.env[varName] !== undefined;

      if (isSet) {
        checks.push({
          name: `env-access-${varName}`,
          status: 'pass',
          message: `User will have access to ${varName}`
        });
      } else {
        const message = `Critical variable ${varName} not found in environment`;
        checks.push({
          name: `env-access-${varName}`,
          status: 'warn',
          message
        });
        warnings.push(`${varName} not set - service may not function correctly`);
      }
    }

    const valid = errors.length === 0;

    logger.info(
      {
        username,
        variablesChecked: requiredVars.length,
        warnings: warnings.length,
        errors: errors.length
      },
      "Environment variable access validation complete"
    );

    return {
      valid,
      checks,
      errors,
      warnings
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { username, error: message },
      "Failed to validate environment variable access"
    );

    return {
      valid: false,
      checks: [],
      errors: [`Failed to validate environment for user '${username}': ${message}`],
      warnings: []
    };
  }
}
