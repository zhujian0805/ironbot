/**
 * Windows Service Wrapper Library
 * Main exports for service module
 */

// Re-export all types
export * from './types/index';

// Export command functions
export { installService, handleInstallCommand } from './commands/install';
export { uninstallService } from './commands/uninstall';
export { getServiceStatus } from './commands/status';
export { getServiceLogs } from './commands/logs';

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
} from './utils/paths';
export {
  validateEnvironmentVariables,
  getEnvironmentFromUser,
  validateServiceEnvironment,
  getEnvironmentSummary,
  isEnvironmentVariableSet,
  getCriticalEnvironmentVariables
} from './utils/env';
export {
  executeCommand,
  executeWithCredentials,
  executePowerShell,
  hasAdminPrivileges,
  getCurrentWindowsUser,
  userAccountExists,
  serviceExists,
  getUserAccountInfo
} from './utils/process';

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
  removeService,
  getServiceStatus,
  isNssmAvailable,
  getNssmVersion
} from './config/nssm';

export {
  buildServiceConfig,
  validateServiceConfig,
  validateEnvironmentVariableAccess,
  formatValidationReport
} from './config/service-config';


