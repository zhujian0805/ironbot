/**
 * Windows Service Wrapper Library
 * Main exports for service module
 */

// Re-export all types
export * from './types/index.js';

// Export command functions
export { installService, handleInstallCommand } from './commands/install.js';
export { uninstallService } from './commands/uninstall.js';
export { getServiceStatus } from './commands/status.js';
export { getServiceLogs } from './commands/logs.js';

// Export utility functions
export { resolveProjectPath, validatePathAccessibility, getLogPath } from './utils/paths.js';
export { validateEnvironmentVariables, getEnvironmentFromUser } from './utils/env.js';
export { executeCommand, executeWithCredentials } from './utils/process.js';

// Export NSSM operations
export {
  executeNssmCommand,
  parseNssmStatus,
  installService as nssmInstallService,
  setServiceAppDirectory,
  setServiceLogging,
  setServiceUser,
  setServiceStartupType,
  setServiceAutoRestart,
  removeService,
  isNssmAvailable
} from './config/nssm.js';
export { buildServiceConfig, validateServiceConfig } from './config/service-config.js';

