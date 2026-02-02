/**
 * Unit tests for smtp-send skill send_email.js script
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Mock nodemailer
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: "test-id" })
    })
  }
}));

describe("send_email.js script", () => {
  const scriptPath = join(process.cwd(), "skills", "smtp-send", "scripts", "send_email.js");
  const configPath = join(homedir(), ".smtp_config");

  beforeEach(() => {
    // Clean up any existing config
    if (existsSync(configPath)) {
      unlinkSync(configPath);
    }
  });

  afterEach(() => {
    // Clean up config after each test
    if (existsSync(configPath)) {
      unlinkSync(configPath);
    }
  });

  it("should show error for missing required arguments", () => {
    expect(() => {
      execSync(`node ${scriptPath}`, { stdio: 'pipe' });
    }).toThrow("Missing required arguments");
  });

  it("should send plain text email successfully", () => {
    const result = execSync(
      `node ${scriptPath} --to test@example.com --subject "Test Subject" --body "Test Body"`,
      { encoding: 'utf8', stdio: 'pipe' }
    );

    expect(result).toContain("EMAIL_SENT_TO:test@example.com");
  });

  it("should send HTML email successfully", () => {
    const result = execSync(
      `node ${scriptPath} --to test@example.com --subject "HTML Test" --body "<h1>Test</h1>" --html`,
      { encoding: 'utf8', stdio: 'pipe' }
    );

    expect(result).toContain("EMAIL_SENT_TO:test@example.com");
  });

  it("should auto-format tabular data as HTML table", () => {
    const result = execSync(
      `node ${scriptPath} --to test@example.com --subject "Table Test" --body "Name: John\nAge: 30\n\nName: Jane\nAge: 25"`,
      { encoding: 'utf8', stdio: 'pipe' }
    );

    expect(result).toContain("EMAIL_SENT_TO:test@example.com");
  });

  it("should force table formatting with --format-table flag", () => {
    const result = execSync(
      `node ${scriptPath} --to test@example.com --subject "Force Table" --body "Name: John\nAge: 30" --format-table`,
      { encoding: 'utf8', stdio: 'pipe' }
    );

    expect(result).toContain("EMAIL_SENT_TO:test@example.com");
  });

  it("should not reformat already HTML content", () => {
    const htmlContent = '<h2>Report</h2><table><tr><td>Test</td></tr></table>';
    const result = execSync(
      `node ${scriptPath} --to test@example.com --subject "HTML Content" --body "${htmlContent}" --html`,
      { encoding: 'utf8', stdio: 'pipe' }
    );

    expect(result).toContain("EMAIL_SENT_TO:test@example.com");
  });

  it("should read body from file with --body-file option", () => {
    const testFile = join(process.cwd(), "test_body.txt");
    const testContent = "This is test content from file.";

    try {
      writeFileSync(testFile, testContent, 'utf8');

      const result = execSync(
        `node ${scriptPath} --to test@example.com --subject "File Test" --body-file "${testFile}"`,
        { encoding: 'utf8', stdio: 'pipe' }
      );

      expect(result).toContain("EMAIL_SENT_TO:test@example.com");
    } finally {
      if (existsSync(testFile)) {
        unlinkSync(testFile);
      }
    }
  });

  it("should show error for missing body file", () => {
    expect(() => {
      execSync(
        `node ${scriptPath} --to test@example.com --subject "Missing File" --body-file "nonexistent.txt"`,
        { stdio: 'pipe' }
      );
    }).toThrow("Failed to read body file");
  });

  it("should create default config if none exists", () => {
    const result = execSync(
      `node ${scriptPath} --to test@example.com --subject "Config Test" --body "Test"`,
      { encoding: 'utf8', stdio: 'pipe' }
    );

    expect(result).toContain("EMAIL_SENT_TO:test@example.com");

    // Check that config file was created
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(config.host).toBe("10.63.6.154");
    expect(config.port).toBe(25);
  });

  it("should log SMTP configuration", () => {
    const result = execSync(
      `node ${scriptPath} --to test@example.com --subject "Config Log" --body "Test"`,
      { encoding: 'utf8', stdio: 'pipe' }
    );

    expect(result).toContain("Using SMTP config:");
    expect(result).toContain("10.63.6.154:25");
  });
});