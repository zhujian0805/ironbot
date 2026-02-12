/**
 * Windows Service Wrapper Type Definitions
 * Core interfaces for service configuration, status, and operations
 */

/**
 * Core configuration for Windows service installation and management
 */
export interface ServiceConfig {
  // Service Identity
  serviceName: string;              // Windows service name (e.g., "IronBot")
  displayName: string;              // Display name in Services console
  description: string;              // Service description shown in UI

  // Execution Context
  username: string;                 // User account to run service as (e.g., "jzhu")
  password?: string;                // User password (encrypted storage via Credential Manager)
  workingDirectory: string;         // Working directory for service process (absolute path)

  // Startup Configuration
  startupType: 'auto' | 'manual' | 'disabled'; // Auto-start on boot
  autoRestart: boolean;             // Restart on failure
  restartDelaySeconds: number;      // Delay before restart attempt (default: 3)
  shutdownTimeoutSeconds: number;   // Grace period for graceful shutdown (default: 30)

  // Logging
  logPath: string;                  // Path to service log file
  appendLogs: boolean;              // Append to existing logs (default: true)

  // Optional
  priority?: 'low' | 'normal' | 'high'; // Process priority (default: normal)
  environmentVariables?: Record<string, string>; // Additional env vars (if needed)
}

/**
 * Current state of the Windows service
 */
export interface ServiceStatus {
  serviceName: string;
  displayName: string;
  state: 'running' | 'stopped' | 'paused' | 'starting' | 'stopping' | 'unknown';
  status: number;                   // Windows service status code
  processId: number | null;         // PID if running, null if stopped
  startType: 'auto' | 'manual' | 'disabled';
  exitCode: number | null;          // Last exit code (if stopped)
  uptime: number | null;            // Uptime in milliseconds (if running)
  lastStartTime: Date | null;       // Last start timestamp
  lastStopTime: Date | null;        // Last stop timestamp
}

/**
 * CLI parameters for install command
 */
export interface InstallOptions {
  serviceName?: string;             // Custom service name (default: "IronBot")
  autoRestart?: boolean;            // Enable auto-restart (default: true)
  startupType?: 'auto' | 'manual';  // Startup type (default: "auto")
  username?: string;                // Override username (default: current user)
  password?: string;                // Provide password non-interactively (normally prompted)
  force?: boolean;                  // Force uninstall existing service first
  skipValidation?: boolean;         // Skip pre-installation checks (not recommended)
  json?: boolean;                   // Output as JSON
}

/**
 * Pre-installation validation output
 */
export interface ValidationResult {
  valid: boolean;
  checks: ValidationCheck[];
  errors: string[];
  warnings: string[];
}

export interface ValidationCheck {
  name: string;                     // Check name (e.g., "admin-privileges")
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
}

/**
 * NSSM command execution result
 */
export interface CommandResult {
  statusCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

/**
 * Service installation result
 */
export interface InstallResult {
  success: boolean;
  serviceName: string;
  displayName: string;
  username: string;
  workingDirectory: string;
  startupType: string;
  logPath: string;
  message: string;
}

/**
 * Service uninstallation result
 */
export interface UninstallResult {
  success: boolean;
  serviceName: string;
  message: string;
}

/**
 * Log entry from service logs
 */
export interface LogEntry {
  timestamp: Date;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  source?: string;
}

/**
 * Logs retrieval result
 */
export interface LogsResult {
  serviceName: string;
  logFile: string;
  lines: LogEntry[];
}

/**
 * Service lifecycle operation result
 */
export interface OperationResult {
  success: boolean;
  serviceName: string;
  operation: 'start' | 'stop' | 'restart' | 'status';
  message: string;
  details?: string;
}

/**
 * Process execution options
 */
export interface ExecOptions {
  timeout?: number;
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * Process execution result
 */
export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}
