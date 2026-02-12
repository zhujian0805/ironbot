/**
 * Logs Command Implementation
 * Handles viewing service logs
 */

import { readFileSync, existsSync } from "fs";
import { logger } from "../../utils/logging.ts";
import type { LogsResult, LogEntry } from "../types/index.ts";
import { getLogPath, getLogsDirectory } from "../utils/paths.ts";
import { resolveProjectPath } from "../utils/paths.ts";

/**
 * Exit codes for logs command
 */
export enum LogsExitCode {
  Success = 0,
  ServiceNotFound = 1,
  LogFileNotFound = 2,
  InvalidFilter = 3
}

/**
 * Read service logs from file
 */
export function readServiceLogs(
  logPath: string,
  lines: number = 50
): LogEntry[] {
  try {
    if (!existsSync(logPath)) {
      logger.warn({ logPath }, "Log file does not exist");
      return [];
    }

    const content = readFileSync(logPath, "utf-8");
    const logLines = content.split("\n").filter(line => line.trim().length > 0);

    // Return last N lines
    const startIndex = Math.max(0, logLines.length - lines);
    return parseLogEntries(logLines.slice(startIndex));
  } catch (error) {
    logger.error({ logPath, error }, "Failed to read log file");
    return [];
  }
}

/**
 * Parse log entries from text lines
 */
export function parseLogEntries(lines: string[]): LogEntry[] {
  return lines.map(line => {
    // Try to parse as JSON (pino format)
    try {
      const parsed = JSON.parse(line);
      return {
        timestamp: new Date(parsed.time || Date.now()),
        level: parsed.level === 20 ? 'debug' : parsed.level === 30 ? 'info' :
               parsed.level === 40 ? 'warn' : parsed.level === 50 ? 'error' : 'info',
        message: parsed.msg || String(parsed),
        source: parsed.component
      };
    } catch {
      // Fallback: treat as plain text
      return {
        timestamp: new Date(),
        level: 'info',
        message: line
      };
    }
  });
}

/**
 * Filter log entries by level
 */
export function filterLogsByLevel(
  entries: LogEntry[],
  level: string
): LogEntry[] {
  return entries.filter(entry => entry.level === level);
}

/**
 * Filter log entries by timestamp
 */
export function filterLogsByTimestamp(
  entries: LogEntry[],
  since: string
): LogEntry[] {
  try {
    let sinceTime: number;

    // Parse relative time formats like "1h", "30m", "5s"
    const match = since.match(/^(\d+)([smh])$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const unit = match[2];
      const multipliers = { s: 1000, m: 60000, h: 3600000 };
      sinceTime = Date.now() - (num * multipliers[unit as keyof typeof multipliers]);
    } else {
      // Try parsing as ISO or other date format
      sinceTime = new Date(since).getTime();
    }

    return entries.filter(entry => entry.timestamp.getTime() >= sinceTime);
  } catch (error) {
    logger.warn({ since, error }, "Failed to parse timestamp filter");
    return entries;
  }
}

/**
 * Get service logs
 */
export async function getServiceLogs(
  serviceName: string = "IronBot",
  projectPath?: string
): Promise<LogsResult | null> {
  try {
    const projPath = projectPath || resolveProjectPath();
    const logPath = getLogPath(projPath);

    logger.info({ serviceName, logPath }, "Retrieving service logs");

    const entries = readServiceLogs(logPath, 50);

    return {
      serviceName,
      logFile: logPath,
      lines: entries
    };
  } catch (error) {
    logger.error(
      { serviceName, error },
      "Error retrieving service logs"
    );
    return null;
  }
}

/**
 * Format logs for human-readable output
 */
export function formatLogsOutput(logs: LogsResult): string {
  const lines: string[] = [];

  lines.push(`\nService: ${logs.serviceName}`);
  lines.push(`Log file: ${logs.logFile}`);
  lines.push(`\n--- Last ${logs.lines.length} log entries ---\n`);

  logs.lines.forEach((entry: LogEntry) => {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    lines.push(`[${timestamp}] ${level}: ${entry.message}`);
  });

  return lines.join("\n");
}

/**
 * Handle logs command from CLI
 */
export async function handleLogsCommand(
  serviceName: string | undefined,
  options: any
): Promise<void> {
  try {
    const name = serviceName || "IronBot";
    const logs = await getServiceLogs(name);

    if (!logs || logs.lines.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({
          serviceName: name,
          logFile: "unknown",
          lines: []
        }, null, 2));
      } else {
        console.log(`\n⚠ No logs found for service '${name}'\n`);
      }
      process.exit(0);
    }

    // Apply filters if specified
    let filtered = logs.lines;

    if (options.level) {
      filtered = filterLogsByLevel(filtered, options.level.toLowerCase());
    }

    if (options.since) {
      filtered = filterLogsByTimestamp(filtered, options.since);
    }

    if (options.json) {
      console.log(JSON.stringify({
        ...logs,
        lines: filtered
      }, null, 2));
    } else {
      const output = {
        ...logs,
        lines: filtered
      };
      console.log(formatLogsOutput(output));
      console.log("");
    }

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (options.json) {
      console.error(JSON.stringify({
        success: false,
        error: message
      }, null, 2));
    } else {
      console.error(`\n✗ Log Retrieval Failed\n  Error: ${message}\n`);
    }

    process.exit(LogsExitCode.LogFileNotFound);
  }
}
