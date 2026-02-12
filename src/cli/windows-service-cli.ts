/**
 * Windows Service CLI Commands
 * Command-line interface for managing IronBot as a Windows service
 */

import { Command } from 'commander';
import type { InstallOptions } from '../services/windows-service/types/index';
import { handleInstallCommand } from '../services/windows-service/commands/install';
import { handleUninstallCommand } from '../services/windows-service/commands/uninstall';
import { handleStatusCommand } from '../services/windows-service/commands/status';
import { handleLogsCommand } from '../services/windows-service/commands/logs';

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
    .action((options: InstallOptions) => handleInstallCommand(options));

  // Uninstall command
  serviceGroup
    .command('uninstall [serviceName]')
    .description('Uninstall IronBot service')
    .option('--force', 'Force uninstall without confirmation')
    .option('--json', 'Output as JSON')
    .action((serviceName: string | undefined, options: any) =>
      handleUninstallCommand(serviceName, options)
    );

  // Status command
  serviceGroup
    .command('status [serviceName]')
    .description('Get service status')
    .option('--json', 'Output as JSON')
    .option('--watch', 'Watch for status changes (not yet implemented)')
    .action((serviceName: string | undefined, options: any) =>
      handleStatusCommand(serviceName, options)
    );

  // Logs command
  serviceGroup
    .command('logs [serviceName]')
    .description('View service logs')
    .option('--lines <number>', 'Number of lines to display', '50')
    .option('--follow', 'Follow log output (not yet implemented)')
    .option('--since <time>', 'Show logs since time (e.g., 1h, 30m)')
    .option('--level <level>', 'Filter by log level (error|warn|info|debug)')
    .option('--json', 'Output as JSON')
    .action((serviceName: string | undefined, options: any) =>
      handleLogsCommand(serviceName, options)
    );

  // Add service group to parent program
  parentProgram.addCommand(serviceGroup);
}

// Export for CLI registration
export default createWindowsServiceCommands;