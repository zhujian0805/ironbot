/**
 * Integration test: SMTP skill execution
 * Tests that the smtp-send skill correctly executes email sending through Claude
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ClaudeProcessor } from "../../src/services/claude_processor.ts";
import { initPermissionManager } from "../../src/services/permission_manager.ts";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";

// Mock the config to disable dev mode
vi.mock("../../src/config.ts", () => ({
  resolveConfig: vi.fn().mockReturnValue({
    anthropicAuthToken: "test-token",
    anthropicModel: "test-model",
    devMode: false,
    skillsDir: "./skills"
  })
}));

let mockAnthropicClient: any;

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    constructor() {
      if (!mockAnthropicClient) {
        mockAnthropicClient = {
          messages: {
            create: vi.fn()
          }
        };
      }
      return mockAnthropicClient;
    }
  }
}));

// Initialize the mock client
mockAnthropicClient = {
  messages: {
    create: vi.fn()
  }
};

const mockToolExecutorInstance = {
  executeTool: vi.fn()
};

vi.mock("../../src/services/tools.ts", () => ({
  ToolExecutor: class MockToolExecutor {
    constructor() {
      return mockToolExecutorInstance;
    }
  },
  getAllowedTools: vi.fn().mockReturnValue([
    {
      name: "run_powershell",
      description: "Execute PowerShell commands",
      input_schema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The PowerShell command to execute"
          }
        },
        required: ["command"]
      }
    }
  ])
}));

describe("SMTP Skill Execution", () => {
  let processor: ClaudeProcessor;

  beforeEach(async () => {
    // Initialize permission manager with smtp-send allowed
    initPermissionManager('./permissions.yaml');

    // Create processor with real skills directory
    processor = new ClaudeProcessor(['./skills']);

    // Ensure skills are loaded
    await processor["ensureSkillsLoaded"]();

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should execute SMTP skill and send email successfully", async () => {
    // Mock Claude's first response - it should use run_powershell to execute the Node.js command
    mockAnthropicClient.messages.create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          {
            type: "text",
            text: "I'll send the email using the SMTP skill."
          },
          {
            type: "tool_use",
            id: "tool_123",
            name: "run_powershell",
            input: {
              command: 'node skills/smtp-send/scripts/send_email.js --to jzhu@blizzard.com --subject "Test Email" --body "This is a test email."'
            }
          }
        ]
      })
      // Mock Claude's second response after tool execution
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: "### Email Sent Successfully\n\nThe test email has been sent to `jzhu@blizzard.com`.\n\n**Tool Output:**\n```\nEMAIL_SENT_TO:jzhu@blizzard.com\n```"
          }
        ]
      });

    // Mock the tool executor to simulate successful email sending
    mockToolExecutorInstance.executeTool.mockResolvedValue({
      success: true,
      result: "EMAIL_SENT_TO:jzhu@blizzard.com",
      stderr: ""
    });

    // Process the message
    const result = await processor.processMessage(
      "run skill smtp-send to send a test email to jzhu@blizzard.com"
    );

    // Verify the result
    expect(result).toContain("Email Sent Successfully");
    expect(result).toContain("EMAIL_SENT_TO:jzhu@blizzard.com");

    // Verify Claude was called with skill documentation in context
    expect(mockAnthropicClient.messages.create).toHaveBeenCalledTimes(2);

    const firstCall = mockAnthropicClient.messages.create.mock.calls[0][0];
    expect(firstCall.system).toContain("smtp-send");
    expect(firstCall.system).toContain("Available Skills");
    expect(firstCall.system).toContain("node skills/smtp-send/scripts/send_email.js");

    // Verify the tool was executed
    expect(mockToolExecutorInstance.executeTool).toHaveBeenCalledWith("run_powershell", {
      command: 'node skills/smtp-send/scripts/send_email.js --to jzhu@blizzard.com --subject "Test Email" --body "This is a test email."'
    });

    console.log("✅ Test Passed: SMTP skill executed successfully");
    console.log("   - Skill documentation injected into Claude context");
    console.log("   - run_powershell tool executed with correct Node.js command");
    console.log("   - Email sent successfully with proper response");
  });

  it("should handle SMTP skill with custom subject and body", async () => {
    const customSubject = "Custom Subject";
    const customBody = "This is a custom email body with special content.";

    // Mock Claude's response
    mockAnthropicClient.messages.create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tool_456",
            name: "run_powershell",
            input: {
              command: `node skills/smtp-send/scripts/send_email.js --to jzhu@blizzard.com --subject "${customSubject}" --body "${customBody}"`
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: "Custom email sent!"
          }
        ]
      });

    // Mock tool execution
    mockToolExecutorInstance.executeTool.mockResolvedValue({
      success: true,
      result: "EMAIL_SENT_TO:jzhu@blizzard.com",
      stderr: ""
    });

    // Process message with custom content
    const result = await processor.processMessage(
      `run skill smtp-send to send an email to jzhu@blizzard.com with subject "${customSubject}" and body "${customBody}"`
    );

    // Verify the custom content was used
    expect(mockToolExecutorInstance.executeTool).toHaveBeenCalledWith("run_powershell", {
      command: `node skills/smtp-send/scripts/send_email.js --to jzhu@blizzard.com --subject "${customSubject}" --body "${customBody}"`
    });

    console.log("✅ Test Passed: SMTP skill handled custom subject and body");
  });

  it("should reject attempts to use Python or other alternatives", async () => {
    // Mock Claude's response - it should NOT try to use Python
    mockAnthropicClient.messages.create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tool_789",
            name: "run_powershell",
            input: {
              command: 'node skills/smtp-send/scripts/send_email.js --to jzhu@blizzard.com --subject "Test" --body "Test"'
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: "Email sent via Node.js as instructed!"
          }
        ]
      });

    mockToolExecutorInstance.executeTool.mockResolvedValue({
      success: true,
      result: "EMAIL_SENT_TO:jzhu@blizzard.com",
      stderr: ""
    });

    const result = await processor.processMessage(
      "send an email using smtp-send skill"
    );

    // Verify it used Node.js, not Python
    expect(mockToolExecutorInstance.executeTool).toHaveBeenCalledWith("run_powershell", {
      command: expect.stringContaining("node skills/smtp-send/scripts/send_email.js")
    });

    // Verify it did NOT try to use Python
    expect(mockToolExecutorInstance.executeTool).not.toHaveBeenCalledWith("run_powershell", {
      command: expect.stringContaining("python")
    });

    console.log("✅ Test Passed: SMTP skill correctly used Node.js, not Python");
  });

  it("should handle email sending failures gracefully", async () => {
    // Mock Claude's response
    mockAnthropicClient.messages.create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tool_fail",
            name: "run_powershell",
            input: {
              command: 'node skills/smtp-send/scripts/send_email.js --to invalid@blizzard.com --subject "Test" --body "Test"'
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: "### Email Failed\n\nFailed to send email.\n\n**Tool Output:**\n```\nEMAIL_FAILED_TO:invalid@blizzard.com\n```"
          }
        ]
      });

    // Mock tool execution failure
    mockToolExecutorInstance.executeTool.mockResolvedValue({
      success: false,
      result: "EMAIL_FAILED_TO:invalid@blizzard.com",
      stderr: "SMTP connection failed"
    });

    const result = await processor.processMessage(
      "run skill smtp-send to send a test email to invalid@blizzard.com"
    );

    // Verify failure was handled
    expect(result).toContain("Failed to send email");
    expect(result).toContain("EMAIL_FAILED_TO:invalid@blizzard.com");

    console.log("✅ Test Passed: SMTP skill handled email sending failure");
  });

  it("should send HTML formatted emails for pretty display", async () => {
    const htmlBody = '<h1>System Report</h1><p>Here is the <strong>formatted</strong> system information:</p><ul><li>CPU: 45%</li><li>Memory: 60%</li></ul>';

    // Mock Claude's response with HTML email
    mockAnthropicClient.messages.create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tool_html",
            name: "run_powershell",
            input: {
              command: `node skills/smtp-send/scripts/send_email.js --to jzhu@blizzard.com --subject "HTML Report" --body "${htmlBody}" --html`
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: "HTML email sent successfully!"
          }
        ]
      });

    // Mock tool execution
    mockToolExecutorInstance.executeTool.mockResolvedValue({
      success: true,
      result: "EMAIL_SENT_TO:jzhu@blizzard.com",
      stderr: ""
    });

    const result = await processor.processMessage(
      "run skill smtp-send to send an HTML formatted email to jzhu@blizzard.com with a system report"
    );

    // Verify HTML flag was used
    expect(mockToolExecutorInstance.executeTool).toHaveBeenCalledWith("run_powershell", {
      command: expect.stringContaining("--html")
    });

    // Verify HTML content was included
    expect(mockToolExecutorInstance.executeTool).toHaveBeenCalledWith("run_powershell", {
      command: expect.stringContaining('<h1>System Report</h1>')
    });

    console.log("✅ Test Passed: SMTP skill sent HTML formatted email");
  });
});
