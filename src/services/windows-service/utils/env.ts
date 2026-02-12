/**
 * Environment Variable Utilities
 * Handles validation and retrieval of environment variables for service context
 */

import type { ValidationResult, ValidationCheck } from "../types/index.js";
import { logger } from "../../utils/logging.ts";

/**
 * Critical environment variables that should be present for IronBot
 */
const CRITICAL_ENV_VARS = [
  "SLACK_BOT_TOKEN",
  "ANTHROPIC_API_KEY"
];

/**
 * Validate that required environment variables exist
 */
export async function validateEnvironmentVariables(
  requiredVars: string[] = CRITICAL_ENV_VARS
): Promise<ValidationResult> {
  const checks: ValidationCheck[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check each required variable
  for (const varName of requiredVars) {
    const exists = process.env[varName] !== undefined;

    if (exists) {
      checks.push({
        name: `env-var-${varName}`,
        status: 'pass',
        message: `Environment variable ${varName} is set`
      });
    } else {
      const message = `Environment variable ${varName} is not set`;
      checks.push({
        name: `env-var-${varName}`,
        status: 'warn',
        message
      });
      warnings.push(message);
    }
  }

  const valid = errors.length === 0;

  logger.debug(
    { validVars: checks.length, warnings: warnings.length, errors: errors.length },
    "Environment variable validation complete"
  );

  return {
    valid,
    checks,
    errors,
    warnings
  };
}

/**
 * Get environment variables from user's environment
 * Returns a copy of current environment variables
 */
export async function getEnvironmentFromUser(_username: string): Promise<Record<string, string>> {
  // Return current process environment as a representation
  // In a real Windows implementation, this would query the registry:
  // HKEY_CURRENT_USER\Environment for the specific user
  const env = { ...process.env } as Record<string, string>;

  logger.debug(
    { varCount: Object.keys(env).length },
    "Retrieved environment variables"
  );

  return env;
}

/**
 * Check if environment variable is set
 */
export function isEnvironmentVariableSet(varName: string): boolean {
  return process.env[varName] !== undefined;
}

/**
 * Get all critical environment variables that are set
 */
export function getCriticalEnvironmentVariables(): Record<string, string | undefined> {
  const vars: Record<string, string | undefined> = {};

  for (const varName of CRITICAL_ENV_VARS) {
    vars[varName] = process.env[varName];
  }

  return vars;
}

/**
 * Validate environment is suitable for service operation
 */
export async function validateServiceEnvironment(
  username?: string
): Promise<ValidationResult> {
  const checks: ValidationCheck[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check critical variables
  const criticalCheck = await validateEnvironmentVariables(CRITICAL_ENV_VARS);
  checks.push(...criticalCheck.checks);
  warnings.push(...criticalCheck.warnings);
  errors.push(...criticalCheck.errors);

  // Check specific variables for IronBot
  const optionalVars = [
    "IRISSAI_LOG_LEVEL",
    "NODE_ENV"
  ];

  for (const varName of optionalVars) {
    if (process.env[varName]) {
      checks.push({
        name: `env-var-optional-${varName}`,
        status: 'pass',
        message: `Optional variable ${varName} is set`
      });
    }
  }

  const valid = errors.length === 0;

  logger.debug(
    {
      totalChecks: checks.length,
      errors: errors.length,
      warnings: warnings.length,
      username
    },
    "Service environment validation complete"
  );

  return {
    valid,
    checks,
    errors,
    warnings
  };
}

/**
 * Get environment variable summary for logging
 */
export function getEnvironmentSummary(): {
  criticalVarsSet: string[];
  criticalVarsMissing: string[];
} {
  const criticalVarsSet: string[] = [];
  const criticalVarsMissing: string[] = [];

  for (const varName of CRITICAL_ENV_VARS) {
    if (process.env[varName]) {
      criticalVarsSet.push(varName);
    } else {
      criticalVarsMissing.push(varName);
    }
  }

  return {
    criticalVarsSet,
    criticalVarsMissing
  };
}
