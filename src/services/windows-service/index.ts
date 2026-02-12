/**
 * Windows Service Wrapper Library
 * Main exports for service module
 */

// Re-export all types
export * from './types/index.js';

// Export command functions
export { installService, handleInstallCommand } from './commands/install.js';
export { uninstallService, handleUninstallCommand } from './commands/uninstall.js';
export { getServiceStatus, handleStatusCommand, formatStatusOutput } from './commands/status.js';
export { getServiceLogs, handleLogsCommand, readServiceLogs, parseLogEntries, filterLogsByLevel, filterLogsByTimestamp } from './commands/logs.js';

// Export utility functions
export {
  resolveProjectPath,
  validatePathAccessibility,
  getLogPath,
  createLogDirectory,
  getLogsDirectory,
  validateProjectStructure,
  resolveConfigFilePath,
  configFileExists
} from './utils/paths.js';
export {
  validateEnvironmentVariables,
  getEnvironmentFromUser,
  validateServiceEnvironment,
  getEnvironmentSummary,
  isEnvironmentVariableSet,
  getCriticalEnvironmentVariables
} from './utils/env.js';
export {
  executeCommand,
  executeWithCredentials,
  executePowerShell,
  hasAdminPrivileges,
  getCurrentWindowsUser,
  userAccountExists,
  serviceExists,
  getUserAccountInfo
} from './utils/process.js';

// Export NSSM operations
export {
  executeNssmCommand,
  parseNssmStatus,
  installService as nssmInstallService,
  setServiceAppDirectory,
  setServiceLogging,
  setServiceUser,
  setServiceObjectName,
  storeAndApplyCredentials,
  setServiceStartupType,
  setServiceAutoRestart,
  startService,
  stopService,
  restartService,
  removeService,
  isNssmAvailable,
  getNssmVersion
} from './config/nssm.js';

export {
  buildServiceConfig,
  validateServiceConfig,
  validateEnvironmentVariableAccess,
  formatValidationReport
} from './config/service-config.js';


