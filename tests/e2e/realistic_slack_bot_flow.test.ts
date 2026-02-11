import { describe, it, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { CronService } from "../../src/cron/service.ts";
import { MessageRouter } from "../../src/services/message_router.ts";
import { ClaudeProcessor } from "../../src/services/claude_processor.ts";
import { resolveConfig } from "../../src/config.ts";
import { logger } from "../../src/utils/logging.ts";
import { SlackConnectionSupervisor } from "../../src/services/slack_connection_supervisor.ts";
import { SlackApiOptimizer } from "../../src/services/slack_api_optimizer.ts";
import { RateLimiter } from "../../src/services/rate_limiter.ts";
import { RetryManager } from "../../src/services/retry_manager.ts";

// Create a more realistic test that connects the message router to an actual cron service
class IntegratedTestClaudeProcessor {
  private scheduledJobs: Array<{id: string, name: string}> = [];
  public toolExecutor: any;

  constructor(private cronService: CronService) {
    this.setupToolExecutor();
  }

  private setupToolExecutor() {
    this.toolExecutor = {
      executeTool: async (toolName: string, params: Record<string, unknown>) => {
        console.log(`Integrated test executing tool: ${toolName}`, params);

        if (toolName === 'cron-scheduler') {
          // When the cron-scheduler skill is called, create the actual job in our cron service
          const input = params.input as string || '';

          if (input.includes('4:10 UTC today')) {
            const job = await this.cronService.add({
              name: 'system-resource-report-complete-1',
              description: 'System resource check and email report',
              schedule: {
                kind: 'at',
                at: new Date(Date.now() + 60000).toISOString() // Schedule for 1 minute from now for testing
              },
              payload: {
                type: 'direct-execution',
                toolName: 'run_powershell',
                toolParams: {
                  command: 'Get-Process | Select-Object Name,CPU | ConvertTo-Html | Out-File ./temp/resource_report.html; Write-Host "Report generated"'
                }
              },
              enabled: true
            });

            console.log(`Created actual job in cron service: ${job.id}`);

            return {
              success: true,
              jobId: job.id,
              jobName: job.name,
              message: `Successfully created job ${job.name} with ID ${job.id}`
            };
          }
        }

        return { success: true };
      }
    };
  }

  async processMessage(text: string, context?: any, skillContext?: any) {
    // Check if the message contains cron scheduling request
    if (text.includes('cron-scheduler') && text.includes('schedule a internal cron job')) {
      // Execute the cron-scheduler tool which will create the job in the cron service
      const result = await this.toolExecutor.executeTool('cron-scheduler', {
        input: text,
        channel: context?.channel || 'D0AC1TXM54L'
      });

      if (result.success) {
        return `✅ Scheduled direct execution job **${result.jobName}** (ID ${result.jobId})\n- Tool: run_powershell\n- Schedule: at 4:10 UTC today\n- Description: System resource check and email report`;
      }
    }

    return "Mock response from Claude";
  }

  checkConnection() {
    return Promise.resolve(true);
  }
}

// Mock Slack client
const createMockSlackClient = () => {
  return {
    chat: {
      postMessage: async (params: any) => {
        console.log(`Mock Slack postMessage:`, params);
        return { ok: true, ts: "mock-ts-" + Date.now() };
      },
      update: async (params: any) => {
        console.log(`Mock Slack update:`, params);
        return { ok: true };
      }
    }
  };
};

describe("Realistic Slack Bot Interaction Flow Test", () => {
  let cronService: CronService;
  let messageRouter: MessageRouter;
  let mockClaude: IntegratedTestClaudeProcessor;
  let mockSlackClient: any;
  let tempStorePath: string;

  beforeEach(async () => {
    // Create a temporary store path for testing
    const tempDir = path.join(process.cwd(), "temp_realistic_test");
    await fs.mkdir(tempDir, { recursive: true });
    tempStorePath = path.join(tempDir, "test_jobs.json");

    // Create the cron service first
    cronService = new CronService({
      log: logger,
      storePath: tempStorePath,
      cronEnabled: true,
      sendMessage: async (payload: any) => {
        console.log("Mock cron sendMessage:", payload);
        return Promise.resolve();
      },
      executeTool: async (toolName: string, params: Record<string, unknown>) => {
        console.log("Mock cron executeTool:", { toolName, params });
        if (toolName === 'powershell') {
          return Promise.resolve({ success: true, result: 'Mock PowerShell execution' });
        }
        return Promise.resolve({ success: true });
      }
    });

    await cronService.start();

    // Create the integrated Claude processor that uses the actual cron service
    mockClaude = new IntegratedTestClaudeProcessor(cronService);

    // Create mock Slack client
    mockSlackClient = createMockSlackClient();

    // Initialize connection supervisor with optimizer and rate limiter
    const slackOptimizer = new SlackApiOptimizer();
    const slackRateLimiter = new RateLimiter({
      enabled: false, // Disable for testing
      requestsPerSecond: 2,
      burstCapacity: 5,
      queueSize: 20,
      retryMaxAttempts: 3,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 10000
    });
    const slackRetryManager = new RetryManager({
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000
    });
    const slackSupervisor = new SlackConnectionSupervisor(
      slackOptimizer,
      slackRateLimiter,
      slackRetryManager
    );

    // Create message router
    const config = resolveConfig({});
    messageRouter = new MessageRouter(
      mockClaude as any,
      mockSlackClient,
      config,
      slackSupervisor
    );
  });

  afterEach(async () => {
    try {
      await cronService.stop();
      // Clean up test files
      if (await fs.stat(tempStorePath).then(() => true).catch(() => false)) {
        await fs.unlink(tempStorePath);
      }
      const backupPath = `${tempStorePath}.bak`;
      if (await fs.stat(backupPath).then(() => true).catch(() => false)) {
        await fs.unlink(backupPath);
      }
    } catch (error) {
      console.warn("Cleanup error:", error);
    }
  });

  it("should process the complete flow: message -> AI processing -> skill execution -> job creation", async () => {
    // Step 1: Define the exact message that would be sent to the bot
    const slackMessage = {
      text: "Please use cron-scheduler to schedule a internal cron job(don't create windows scheduled task) in channel D0AC1TXM54L at 4:10 UTC today with task based on this: \"检查目前系统资源使用率，保存到一个非常完美的HTML文件，then run the @smpt-send skill to send the file to jzhu@blizzard.com, use the MTA server: 10.63.6.154\"",
      channel: "D0AC1TXM54L",
      user: "U1234567890",
      ts: "1234567890.001200",
      thread_ts: "1234567890.001200"
    };

    console.log("🚀 Step 1: Sending message to bot");
    console.log("📨 Message:", slackMessage.text);

    // Step 2: Send the message to the bot (this triggers Claude processing)
    console.log("🤖 Step 2: Bot processing message with Claude AI");

    // Track the Slack client response since the message router will send it there
    let slackResponse: any = null;
    const originalPostMessage = mockSlackClient.chat.postMessage;
    mockSlackClient.chat.postMessage = async (params: any) => {
      slackResponse = params;
      console.log("💬 Bot response via Slack client:", params.text);

      // Verify the response contains expected elements right away
      if (params.text && params.text.includes('Scheduled') && params.text.includes('job')) {
        console.log("✅ Bot response contains job scheduling confirmation");
      }

      return originalPostMessage.call(mockSlackClient.chat, params);
    };

    // Create a mock say function to capture responses as backup
    let sayResponse: string | null = null;
    const mockSay = async (message: any) => {
      sayResponse = typeof message === 'string' ? message : JSON.stringify(message);
      console.log("💬 Bot response via say():", sayResponse);
    };

    // This is where the complete flow happens:
    // 1. MessageRouter receives the message
    // 2. ClaudeProcessor processes it and recognizes cron-scheduler intent
    // 3. The cron-scheduler skill is called via toolExecutor
    // 4. The skill creates an actual job in the cron service
    await messageRouter.handleMessage(slackMessage, mockSay);

    console.log("🔍 Step 3: Checking for scheduled jobs in cron service");

    // Step 3: Verify that jobs were created in the cron system
    const jobs = await cronService.list();
    console.log(`📋 Found ${jobs.length} jobs in the cron service`);

    // Step 4: Validate that a job was actually created
    assert.ok(
      jobs.length > 0,
      `Expected at least 1 job to be created, but found ${jobs.length}`
    );

    const job = jobs[0];
    console.log("📝 Job details:");
    console.log(`  - ID: ${job.id}`);
    console.log(`  - Name: ${job.name}`);
    console.log(`  - Enabled: ${job.enabled}`);
    console.log(`  - Schedule: ${job.schedule.kind} at ${job.schedule.at || job.schedule.every || job.schedule.cron}`);

    // Verify the job has expected characteristics based on the request
    assert.ok(
      job.name.includes('resource') || job.name.includes('report') || job.name.includes('system'),
      `Job name should relate to system resource reporting, got: ${job.name}`
    );

    assert.strictEqual(
      job.schedule.kind,
      'at',
      `Schedule should be 'at' type for one-time execution, got: ${job.schedule.kind}`
    );

    // Verify the job payload is for direct execution (as expected for system tasks)
    assert.ok(
      'type' in job.payload && job.payload.type === 'direct-execution',
      'Job should be a direct execution type'
    );

    assert.ok(
      job.payload.toolName,
      'Direct execution job should have a tool name'
    );

    assert.ok(
      job.payload.toolParams?.command,
      'Direct execution job should have a command parameter'
    );

    console.log("🔧 Tool:", job.payload.toolName);
    console.log("📋 Command length:", job.payload.toolParams?.command?.length || 0, "characters");

    // Step 5: Verify bot responded appropriately
    // The response could come through either the Slack client or the say callback
    const hasValidResponse = (slackResponse && slackResponse.text && slackResponse.text.includes('Scheduled') && slackResponse.text.includes('job')) ||
                           (sayResponse && sayResponse.includes('Scheduled') && sayResponse.includes('job'));

    console.log(`💬 Response via Slack: ${!!slackResponse}, Response via say: ${!!sayResponse}`);

    assert.ok(
      hasValidResponse,
      `Bot should have responded with job scheduling confirmation via Slack (${!!slackResponse}) or say (${!!sayResponse}). Slack response: ${slackResponse?.text || 'none'}, Say response: ${sayResponse || 'none'}`
    );

    console.log("✅ Step 5: All verifications passed!");
    console.log("🎯 Complete flow verified: Message → AI Processing → Skill Execution → Job Creation → Bot Response");
  });

  it("should verify the job persists correctly in the store", async () => {
    // Send the message again to create a job
    const slackMessage = {
      text: "Please use cron-scheduler to schedule a internal cron job(don't create windows scheduled task) in channel D0AC1TXM54L at 4:10 UTC today with task based on this: \"检查目前系统资源使用率，保存到一个非常完美的HTML文件，then run the @smpt-send skill to send the file to jzhu@blizzard.com, use the MTA server: 10.63.6.154\"",
      channel: "D0AC1TXM54L",
      user: "U1234567890",
      ts: "1234567890.001200",
      thread_ts: "1234567890.001200"
    };

    const mockSay = async (message: any) => {
      const responseText = typeof message === 'string' ? message : JSON.stringify(message);
      console.log("Bot response:", responseText);
    };

    // Process the message to create the job
    await messageRouter.handleMessage(slackMessage, mockSay);

    // List jobs to verify it exists
    const jobs = await cronService.list();
    assert.ok(jobs.length > 0, "Job should exist");

    const job = jobs[0];

    // Verify persistence by stopping and restarting the service to reload from disk
    await cronService.stop();

    // Restart with same store path
    const restartedCronService = new CronService({
      log: logger,
      storePath: tempStorePath,
      cronEnabled: true,
      sendMessage: async (payload: any) => {
        console.log("Mock cron sendMessage:", payload);
        return Promise.resolve();
      },
      executeTool: async (toolName: string, params: Record<string, unknown>) => {
        console.log("Mock cron executeTool:", { toolName, params });
        if (toolName === 'powershell') {
          return Promise.resolve({ success: true, result: 'Mock PowerShell execution' });
        }
        return Promise.resolve({ success: true });
      }
    });

    await restartedCronService.start();

    try {
      const reloadedJobs = await restartedCronService.list();
      assert.ok(reloadedJobs.length > 0, "Job should still exist after restart");
      assert.strictEqual(reloadedJobs[0].id, job.id, "Same job ID should be loaded from store");
      console.log("✅ Job persistence verified - survives service restart");
    } finally {
      await restartedCronService.stop();
    }
  });
});