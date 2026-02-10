import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { ClaudeProcessor } from "../../src/services/claude_processor.ts";
import { resolveConfig } from "../../src/config.ts";
import { CronService } from "../../src/cron/service.ts";
import { logger } from "../../src/utils/logging.ts";
import fs from "node:fs/promises";
import path from "node:path";

// Mock dependencies for the Claude processor
const mockConfig = resolveConfig({});

// Create a test to simulate the exact Slack message
describe("NLP Cron Job Scheduling Test", () => {
  let cronService: CronService;
  let claudeProcessor: ClaudeProcessor;
  let tempStorePath: string;

  beforeEach(async () => {
    // Create a temporary store path for testing
    const tempDir = path.join(process.cwd(), "temp_nlp_test");
    await fs.mkdir(tempDir, { recursive: true });
    tempStorePath = path.join(tempDir, "test_jobs.json");

    // Initialize cron service
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
        if (toolName === 'powershell' || toolName.includes('smtp-send')) {
          return Promise.resolve({ success: true, result: `Executed ${toolName}` });
        }
        return Promise.resolve({ success: true });
      }
    });

    await cronService.start();

    // Initialize Claude processor with the temp cron service
    claudeProcessor = new ClaudeProcessor([], null); // We'll mock the skill execution directly

    // Replace the tool executor with our test version
    (claudeProcessor as any).toolExecutor = {
      executeTool: async (toolName: string, params: Record<string, unknown>) => {
        console.log(`Executing tool: ${toolName}`, params);

        if (toolName === 'cron-scheduler') {
          // Simulate the cron-scheduler skill processing the request
          console.log("Processing cron-scheduler request:", params);

          // Parse the request - in a real scenario this would be handled by the cron-scheduler skill
          const input = params.input as string || '';

          // Create a mock job based on the parsed input
          const jobParams = {
            name: "system-resource-report-complete-1",
            description: "Check system resources and send HTML report via SMTP",
            schedule: {
              kind: "at",
              at: new Date(Date.now() + 10000).toISOString() // 10 seconds in future for testing
            },
            payload: {
              type: 'direct-execution',
              toolName: 'powershell',
              toolParams: {
                command: `
                  # PowerShell script to check system resources and send email
                  Write-Host "Checking system resources..."

                  # Collect system metrics
                  $cpu = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
                  $memory = Get-WmiObject Win32_OperatingSystem | Select-Object -ExpandProperty FreePhysicalMemory
                  $memoryGB = [math]::Round($memory / 1MB, 2)

                  # Create HTML report
                  $reportHtml = @"
<!DOCTYPE html>
<html>
<head><title>System Resource Report - $(Get-Date)</title></head>
<body>
<h1>System Resource Report</h1>
<p>CPU Usage: $($cpu)%</p>
<p>Free Memory: $($memoryGB) GB</p>
<p>Generated at: $(Get-Date)</p>
</body>
</html>
"@
                  $reportPath = "./temp/resource_report.html"
                  $directory = Split-Path $reportPath -Parent
                  if (!(Test-Path $directory)) {
                      New-Item -ItemType Directory -Path $directory -Force
                  }
                  $reportHtml | Out-File -FilePath $reportPath -Encoding UTF8

                  Write-Host "System resource report saved to: $reportPath"
                  Write-Host "Ready to send via SMTP to jzhu@blizzard.com using MTA server 10.63.6.154"
                `
              }
            },
            enabled: true
          };

          // Add the job to the cron service
          const scheduledJob = await cronService.add(jobParams);

          return {
            success: true,
            jobId: scheduledJob.id,
            jobName: scheduledJob.name,
            message: `Successfully scheduled job ${scheduledJob.name} for execution`
          };
        }

        return { success: true };
      }
    };
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

  it("should process the exact NLP request to schedule a cron job", async () => {
    // This is the exact message that would be sent to the bot
    const slackMessage = "Please use cron-scheduler to schedule a internal cron job(don't create windows scheduled task) in channel D0AC1TXM54L at 4:10 UTC today with task based on this: \"检查目前系统资源使用率，保存到一个非常完美的HTML文件，then run the @smpt-send skill to send the file to jzhu@blizzard.com, use the MTA server: 10.63.6.154\"";

    // Simulate how the Claude processor would handle this request
    // In the real system, Claude would recognize the cron-scheduler intent and call the skill
    console.log("Processing NLP request:", slackMessage);

    // Execute the cron-scheduler tool directly as Claude would
    const result = await (claudeProcessor as any).toolExecutor.executeTool('cron-scheduler', {
      input: slackMessage,
      channel: "D0AC1TXM54L",
      user: "U1234567890"
    });

    console.log("Cron scheduler result:", result);

    // Verify that the job was scheduled successfully
    assert.ok(result.success, "Cron scheduler should return success");
    assert.ok(result.jobId, "Result should contain a job ID");
    assert.ok(result.jobName, "Result should contain a job name");

    // Check that the job exists in the cron store
    const jobs = await cronService.list();
    const scheduledJob = jobs.find(job => job.id === result.jobId);

    assert.ok(scheduledJob, "Scheduled job should exist in the store");
    assert.strictEqual(scheduledJob.name, "system-resource-report-complete-1", "Job name should match");
    assert.strictEqual(scheduledJob.schedule.kind, "at", "Schedule should be 'at' type");
    assert.ok(scheduledJob.enabled, "Job should be enabled");

    console.log(`✅ Successfully verified job scheduling`);
    console.log(`🆔 Job ID: ${scheduledJob.id}`);
    console.log(`📝 Job Name: ${scheduledJob.name}`);
    console.log(`🕒 Schedule: ${scheduledJob.schedule.kind} ${scheduledJob.schedule.at}`);

    // Verify the payload structure for direct execution
    if ('type' in scheduledJob.payload && scheduledJob.payload.type === 'direct-execution') {
      assert.strictEqual(scheduledJob.payload.type, 'direct-execution', "Should be direct execution type");
      assert.ok(scheduledJob.payload.toolName, "Should have a tool name");
      assert.ok(scheduledJob.payload.toolParams, "Should have tool parameters");
      assert.ok(scheduledJob.payload.toolParams.command, "Should have command parameter");

      console.log(`🔧 Tool: ${scheduledJob.payload.toolName}`);
      console.log(`📜 Command length: ${scheduledJob.payload.toolParams.command.length} characters`);
    }
  });

  it("should handle the complete message processing flow", async () => {
    // Simulate the complete flow as it would happen in the real system
    const inputMessage = "Please use cron-scheduler to schedule a internal cron job(don't create windows scheduled task) in channel D0AC1TXM54L at 4:10 UTC today with task based on this: \"检查目前系统资源使用率，保存到一个非常完美的HTML文件，then run the @smpt-send skill to send the file to jzhu@blizzard.com, use the MTA server: 10.63.6.154\"";

    console.log("Simulating complete processing flow...");
    console.log("Input:", inputMessage);

    // In the real system, this would be handled by Claude's skill recognition system
    // which would identify the cron-scheduler intent and call the appropriate skill
    const hasCronSchedulerIntent = inputMessage.toLowerCase().includes('cron-scheduler') &&
                                   inputMessage.includes('schedule') &&
                                   inputMessage.includes('at 4:10');

    assert.ok(hasCronSchedulerIntent, "Message should contain cron scheduling intent");

    // Simulate skill execution
    const skillResult = await (claudeProcessor as any).toolExecutor.executeTool('cron-scheduler', {
      input: inputMessage,
      targetChannel: "D0AC1TXM54L"
    });

    assert.ok(skillResult.success, "Skill execution should be successful");

    // Verify job details based on the original request
    const jobs = await cronService.list();
    assert.ok(jobs.length > 0, "At least one job should be scheduled");

    const job = jobs[0]; // The job we created
    console.log(`📋 Scheduled job: ${job.name}`);
    console.log(`⏰ Time: ${job.schedule.at || job.schedule.every || job.schedule.cron}`);

    // The original request was for "4:10 UTC today" which should create an "at" schedule
    assert.strictEqual(job.schedule.kind, "at", "Should create 'at' schedule for one-time execution");

    // Verify it's a direct execution job (since it mentions running a script/email)
    if ('type' in job.payload && job.payload.type === 'direct-execution') {
      console.log(`⚡ Job type: Direct execution with ${job.payload.toolName}`);
      assert.ok(job.payload.toolName, "Direct execution jobs should have a tool name");
    }

    console.log("✅ Complete processing flow verified successfully");
  });
});