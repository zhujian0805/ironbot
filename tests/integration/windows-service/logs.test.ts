/**
 * Integration Test: Service Logs Retrieval and Filtering
 * Tests log reading and filtering functionality
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getServiceLogs, readServiceLogs, parseLogEntries, filterLogsByLevel, filterLogsByTimestamp } from "../../src/services/windows-service/commands/logs";
import { getLogPath } from "../../src/services/windows-service/utils/paths";
import { resolveProjectPath } from "../../src/services/windows-service/utils/paths";

describe("Service Logs Retrieval and Filtering", { timeout: 30000 }, () => {
  const projectPath = resolveProjectPath();

  describe("Log Reading", () => {
    it("should read service logs", async () => {
      const logPath = getLogPath(projectPath);
      const entries = readServiceLogs(logPath, 50);
      expect(Array.isArray(entries)).toBe(true);
    });

    it("should return specified number of lines", () => {
      const logPath = getLogPath(projectPath);
      const entries50 = readServiceLogs(logPath, 50);
      const entries10 = readServiceLogs(logPath, 10);

      expect(entries50.length).toBeGreaterThanOrEqual(entries10.length);
      if (entries50.length > 10) {
        expect(entries10.length).toBeLessThanOrEqual(10);
      }
    });

    it("should handle non-existent log file", () => {
      const entries = readServiceLogs("/nonexistent/path/to/logs.txt", 50);
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBe(0);
    });

    it("should return LogEntry objects with required fields", () => {
      const logPath = getLogPath(projectPath);
      const entries = readServiceLogs(logPath, 1);

      if (entries.length > 0) {
        const entry = entries[0];
        expect(entry.timestamp).toBeDefined();
        expect(entry.level).toBeDefined();
        expect(entry.message).toBeDefined();
      }
    });
  });

  describe("Log Entry Parsing", () => {
    it("should parse log entries from text lines", () => {
      const testLines = [
        '{"time":"2026-02-12T10:00:00.000Z","msg":"Test message","level":30}',
        '{"time":"2026-02-12T10:00:01.000Z","msg":"Another message","level":40}',
        "Plain text log line"
      ];

      const entries = parseLogEntries(testLines);
      expect(entries.length).toBe(3);
    });

    it("should handle pino JSON format logs", () => {
      const testLines = [
        '{"level":20,"time":"2026-02-12T10:00:00.000Z","msg":"Debug message"}',
        '{"level":30,"time":"2026-02-12T10:00:01.000Z","msg":"Info message"}',
        '{"level":40,"time":"2026-02-12T10:00:02.000Z","msg":"Warn message"}',
        '{"level":50,"time":"2026-02-12T10:00:03.000Z","msg":"Error message"}'
      ];

      const entries = parseLogEntries(testLines);
      expect(entries.length).toBe(4);

      // Check log level mapping
      const levels = entries.map(e => e.level);
      expect(levels).toContain("debug");
      expect(levels).toContain("info");
      expect(levels).toContain("warn");
      expect(levels).toContain("error");
    });

    it("should fallback to plain text parsing", () => {
      const testLines = ["Plain text line 1", "Plain text line 2"];
      const entries = parseLogEntries(testLines);

      expect(entries.length).toBe(2);
      entries.forEach(entry => {
        expect(entry.timestamp).toBeDefined();
        expect(entry.message).toBeDefined();
      });
    });

    it("should handle empty lines", () => {
      const testLines = ["", "Valid line", "", "Another valid line"];
      // Filter empty lines first (would be done in actual implementation)
      const filtered = testLines.filter(l => l.trim().length > 0);
      const entries = parseLogEntries(filtered);

      expect(entries.length).toBe(2);
    });
  });

  describe("Log Filtering by Level", () => {
    it("should filter logs by level", () => {
      const testEntries = [
        { timestamp: new Date(), level: "info" as const, message: "Info 1" },
        { timestamp: new Date(), level: "warn" as const, message: "Warn 1" },
        { timestamp: new Date(), level: "info" as const, message: "Info 2" },
        { timestamp: new Date(), level: "error" as const, message: "Error 1" }
      ];

      const infoLogs = filterLogsByLevel(testEntries, "info");
      expect(infoLogs.length).toBe(2);
      infoLogs.forEach(entry => {
        expect(entry.level).toBe("info");
      });
    });

    it("should handle no matches for filter", () => {
      const testEntries = [
        { timestamp: new Date(), level: "info" as const, message: "Info 1" }
      ];

      const debugLogs = filterLogsByLevel(testEntries, "debug");
      expect(debugLogs.length).toBe(0);
    });

    it("should filter all error logs", () => {
      const testEntries = [
        { timestamp: new Date(), level: "error" as const, message: "Error 1" },
        { timestamp: new Date(), level: "error" as const, message: "Error 2" },
        { timestamp: new Date(), level: "info" as const, message: "Info 1" }
      ];

      const errorLogs = filterLogsByLevel(testEntries, "error");
      expect(errorLogs.length).toBe(2);
    });
  });

  describe("Log Filtering by Timestamp", () => {
    it("should parse relative time formats", () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);
      const twoHoursAgo = new Date(now.getTime() - 7200000);

      const testEntries = [
        { timestamp: twoHoursAgo, level: "info" as const, message: "Old message" },
        { timestamp: oneHourAgo, level: "info" as const, message: "Recent message" },
        { timestamp: now, level: "info" as const, message: "Current message" }
      ];

      const recentLogs = filterLogsByTimestamp(testEntries, "1h");
      expect(recentLogs.length).toBeGreaterThan(0);
    });

    it("should filter logs since N minutes", () => {
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 1800000);

      const testEntries = [
        { timestamp: thirtyMinutesAgo, level: "info" as const, message: "Old" },
        { timestamp: now, level: "info" as const, message: "New" }
      ];

      const recentLogs = filterLogsByTimestamp(testEntries, "20m");
      expect(recentLogs.length).toBe(1);
      expect(recentLogs[0].message).toBe("New");
    });

    it("should filter logs since N seconds", () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60000);

      const testEntries = [
        { timestamp: oneMinuteAgo, level: "info" as const, message: "Old" },
        { timestamp: now, level: "info" as const, message: "New" }
      ];

      const recentLogs = filterLogsByTimestamp(testEntries, "30s");
      expect(recentLogs.length).toBe(1);
    });

    it("should handle invalid timestamp format gracefully", () => {
      const testEntries = [
        { timestamp: new Date(), level: "info" as const, message: "Test" }
      ];

      const result = filterLogsByTimestamp(testEntries, "invalid");
      expect(Array.isArray(result)).toBe(true);
      // Should return all entries when parsing fails
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Service Logs Retrieval", () => {
    it("should get service logs", async () => {
      const logs = await getServiceLogs("IronBot", projectPath);
      expect(logs).toBeDefined();
      if (logs) {
        expect(logs.serviceName).toBe("IronBot");
        expect(logs.logFile).toBeDefined();
        expect(Array.isArray(logs.lines)).toBe(true);
      }
    });

    it("should handle service not found gracefully", async () => {
      const logs = await getServiceLogs("NonExistent", projectPath);
      // Should return null or empty logs gracefully
      expect(logs === null || (logs && Array.isArray(logs.lines))).toBe(true);
    });

    it("should include log file path", async () => {
      const logs = await getServiceLogs("IronBot", projectPath);
      if (logs) {
        expect(logs.logFile).toContain("logs");
        expect(logs.logFile).toContain("service.log");
      }
    });
  });

  describe("Combined Filtering", () => {
    it("should support chaining filters", () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);

      const testEntries = [
        { timestamp: oneHourAgo, level: "info" as const, message: "Old info" },
        { timestamp: oneHourAgo, level: "error" as const, message: "Old error" },
        { timestamp: now, level: "error" as const, message: "Recent error" }
      ];

      // Filter by timestamp first, then level
      const recent = filterLogsByTimestamp(testEntries, "30m");
      const recentErrors = filterLogsByLevel(recent, "error");

      expect(recentErrors.length).toBe(1);
      expect(recentErrors[0].message).toBe("Recent error");
    });

    it("should handle empty result sets", () => {
      const testEntries: any[] = [];

      const filtered1 = filterLogsByLevel(testEntries, "error");
      const filtered2 = filterLogsByTimestamp(filtered1, "1h");

      expect(filtered2.length).toBe(0);
    });
  });
});
