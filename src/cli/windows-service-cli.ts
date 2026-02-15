/**
 * Windows Service CLI Commands
 * Command-line interface for managing IronBot as a Windows service
 */

import { Command } from 'commander';
import { handleInstallCommand } from '../services/windows-service/commands/install.ts';
import { handleUninstallCommand } from '../services/windows-service/commands/uninstall.ts';
import { handleStatusCommand } from '../services/windows-service/commands/status.ts';
import { handleLogsCommand } from '../services/windows-service/commands/logs.ts';
import { startService, stopService, restartService } from '../services/windows-service/config/nssm.ts';

/**
 * Create windows-service command group
 * Usage: ironbot-service <command> [options]
 */
export function createWindowsServiceCommands(parentProgram: Command): void {
  const serviceGroup = new Command('windows-service')
    .description('Manage IronBot as a Windows service')
    .alias('service');

  // Set exit override to prevent process.exit in tests
  serviceGroup.exitOverride();

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
    .action(async (options: any) => {
      try {
        await handleInstallCommand(options);
      } catch (error) {
        console.error(`Install failed: ${error}`);
        process.exit(1);
      }
    });

  // Uninstall command
  serviceGroup
    .command('uninstall [serviceName]')
    .description('Uninstall IronBot service')
    .option('--force', 'Force uninstall without confirmation')
    .option('--json', 'Output as JSON')
    .action(async (serviceName: string | undefined, options: any) => {
      try {
        await handleUninstallCommand(serviceName, options);
      } catch (error) {
        console.error(`Uninstall failed: ${error}`);
        process.exit(1);
      }
    });

  // Start command
  serviceGroup
    .command('start [serviceName]')
    .description('Start IronBot service')
    .option('--json', 'Output as JSON')
    .action(async (serviceName: string | undefined, options: any) => {
      try {
        const name = serviceName || 'IronBot';
        const result = await startService(name);

        if (result) {
          if (options.json) {
            console.log(JSON.stringify({
              success: true,
              serviceName: name,
              message: `Service '${name}' started successfully`
            }, null, 2));
          } else {
            console.log(`\n✓ Service '${name}' started successfully\n`);
          }
          process.exit(0);
        } else {
          throw new Error(`Failed to start service '${name}'`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Start failed: ${message}`);
        process.exit(1);
      }
    });

  // Stop command
  serviceGroup
    .command('stop [serviceName]')
    .description('Stop IronBot service')
    .option('--timeout <seconds>', 'Timeout in seconds (default: 30)', '30')
    .option('--json', 'Output as JSON')
    .action(async (serviceName: string | undefined, options: any) => {
      try {
        const name = serviceName || 'IronBot';
        const timeout = parseInt(options.timeout, 10) || 30;

        const result = await stopService(name, timeout);

        if (result) {
          if (options.json) {
            console.log(JSON.stringify({
              success: true,
              serviceName: name,
              message: `Service '${name}' stopped successfully`
            }, null, 2));
          } else {
            console.log(`\n✓ Service '${name}' stopped successfully\n`);
          }
          process.exit(0);
        } else {
          throw new Error(`Failed to stop service '${name}'`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Stop failed: ${message}`);
        process.exit(1);
      }
    });

  // Restart command
  serviceGroup
    .command('restart [serviceName]')
    .description('Restart IronBot service')
    .option('--json', 'Output as JSON')
    .action(async (serviceName: string | undefined, options: any) => {
      try {
        const name = serviceName || 'IronBot';

        const result = await restartService(name);

        if (result) {
          if (options.json) {
            console.log(JSON.stringify({
              success: true,
              serviceName: name,
              message: `Service '${name}' restarted successfully`
            }, null, 2));
          } else {
            console.log(`\n✓ Service '${name}' restarted successfully\n`);
          }
          process.exit(0);
        } else {
          throw new Error(`Failed to restart service '${name}'`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Restart failed: ${message}`);
        process.exit(1);
      }
    });

  // Status command
  serviceGroup
    .command('status [serviceName]')
    .description('Check IronBot service status')
    .option('--json', 'Output as JSON')
    .action(async (serviceName: string | undefined, options: any) => {
      try {
        await handleStatusCommand(serviceName, options);
      } catch (error) {
        console.error(`Status failed: ${error}`);
        process.exit(1);
      }
    });

  // Logs command
  serviceGroup
    .command('logs [serviceName]')
    .description('View service logs')
    .option('--lines <number>', 'Number of lines to display', '50')
    .option('--follow', 'Follow log output (not yet implemented)')
    .option('--since <time>', 'Show logs since time (e.g., 1h, 30m)')
    .option('--level <level>', 'Filter by log level (error|warn|info|debug)')
    .option('--json', 'Output as JSON')
    .action(async (serviceName: string | undefined, options: any) => {
      try {
        await handleLogsCommand(serviceName, options);
      } catch (error) {
        console.error(`Logs failed: ${error}`);
        process.exit(1);
      }
    });

  // Add service group to parent program
  parentProgram.addCommand(serviceGroup);
}

// Export for CLI registration
export default createWindowsServiceCommands;
