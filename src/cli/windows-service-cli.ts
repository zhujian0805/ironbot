/**
 * Windows Service CLI Commands
 * Command-line interface for managing IronBot as a Windows service
 */

import { Command } from 'commander';
import type { InstallOptions } from '../services/windows-service/types/index.js';
import { handleInstallCommand } from '../services/windows-service/commands/install.js';

/**
 * Create windows-service command group
 * Usage: ironbot-service <command> [options]
 */
export function createWindowsServiceCommands(parentProgram: Command): void {
  const serviceGroup = new Command('windows-service')
    .description('Manage IronBot as a Windows service')
    .alias('service');

  // Install command
  serviceGroup
    .command('install')
    .description('Install IronBot as a Windows service')
    .option('--service-name <name>', 'Service name (default: IronBot)', 'IronBot')
    .option('--startup-type <type>', 'Startup type (auto|manual)', 'auto')
    .option('--no-auto-restart', 'Disable auto-restart on failure')
    .option('--username <user>', 'User to run service as (default: current user)')
    .option('--password <pwd>', 'User password (normally prompted, not recommended)')
    .option('--force', 'Force uninstall existing service first')
    .option('--skip-validation', 'Skip pre-installation checks')
    .option('--json', 'Output as JSON')
    .action(handleInstallCommand);

  // Uninstall command
  serviceGroup
    .command('uninstall [serviceName]')
    .description('Uninstall IronBot service')
    .option('--force', 'Force uninstall without confirmation')
    .option('--json', 'Output as JSON')
    .action(async (serviceName, options) => {
      try {
        // To be implemented in Phase 6
        console.log('Uninstall command not yet implemented');
        console.log('Service:', serviceName || 'IronBot', 'Options:', options);
        process.exit(1);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Status command
  serviceGroup
    .command('status [serviceName]')
    .description('Get service status')
    .option('--json', 'Output as JSON')
    .option('--watch', 'Watch for status changes')
    .action(async (serviceName, options) => {
      try {
        // To be implemented in Phase 6
        console.log('Status command not yet implemented');
        console.log('Service:', serviceName || 'IronBot', 'Options:', options);
        process.exit(1);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Logs command
  serviceGroup
    .command('logs [serviceName]')
    .description('View service logs')
    .option('--lines <number>', 'Number of lines to display', '50')
    .option('--follow', 'Follow log output')
    .option('--since <time>', 'Show logs since time (e.g., 1h, 30m)')
    .option('--level <level>', 'Filter by log level (error|warn|info|debug)')
    .option('--json', 'Output as JSON')
    .action(async (serviceName, options) => {
      try {
        // To be implemented in Phase 6
        console.log('Logs command not yet implemented');
        console.log('Service:', serviceName || 'IronBot', 'Options:', options);
        process.exit(1);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Add service group to parent program
  parentProgram.addCommand(serviceGroup);
}

// Export for CLI registration
export default createWindowsServiceCommands;

