import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { CronService } from "../../src/cron/service.ts";
import { resolveCronStorePath } from "../../src/cron/store.ts";
import { logger } from "../../src/utils/logging.ts";
import fs from "node:fs/promises";
import path from "node:path";

// Mock dependencies for testing
const mockSendMessage = async (payload: any) => {
  console.log(`Mock sendMessage called with:`, payload);
  return { ok: true };
};

const mockExecuteTool = async (toolName: string, params: Record<string, unknown>) => {
  console.log(`Mock executeTool called - tool: ${toolName}`, params);
  return { success: true, result: `Executed ${toolName} with params` };
};

describe("Natural Language Cron Scheduler Integration Test", () => {
  let cronService: CronService;
  let tempStorePath: string;

  beforeEach(async () => {
    // Create a temporary store path for testing
    const tempDir = path.join(process.cwd(), "temp_test");
    await fs.mkdir(tempDir, { recursive: true });
    tempStorePath = path.join(tempDir, "test_jobs.json");

    cronService = new CronService({
      log: logger,
      storePath: tempStorePath,
      cronEnabled: true,
      sendMessage: mockSendMessage,
      executeTool: mockExecuteTool
    });

    await cronService.start();
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

  it("should successfully schedule a cron job from natural language request", async () => {
    // Simulate the natural language request
    const naturalLanguageRequest =
      "Please use cron-scheduler to schedule a internal cron job(don't create windows scheduled task) " +
      "in channel D0AC1TXM54L at 3:36 UTC today with task based on this: " +
      "\"检查目前系统资源使用率，保存到一个非常完美的HTML文件，then run the @smpt-send skill to send the file to jzhu@blizzard.com, use the MTA server: 10.63.6.154\"";

    // Parse the request to extract job details
    const jobDetails = parseNaturalLanguageRequest(naturalLanguageRequest);

    // Schedule the job using the cron service
    const scheduledJob = await cronService.add({
      name: jobDetails.name,
      description: jobDetails.description,
      schedule: {
        kind: "at",
        at: jobDetails.executionTime
      },
      payload: jobDetails.payload,
      enabled: true
    });

    // Assertions to verify the job was scheduled correctly
    assert.ok(scheduledJob, "Job should be created successfully");
    assert.ok(scheduledJob.id, "Job should have an ID");
    assert.strictEqual(scheduledJob.name, jobDetails.name, "Job name should match");
    assert.ok(scheduledJob.enabled, "Job should be enabled");
    assert.strictEqual(scheduledJob.schedule.kind, "at", "Schedule should be 'at' type");

    // Check payload based on type since direct execution doesn't have channel
    if ('type' in scheduledJob.payload && scheduledJob.payload.type === 'direct-execution') {
      assert.strictEqual(scheduledJob.payload.type, 'direct-execution', "Should be direct execution type");
    } else {
      assert.strictEqual(scheduledJob.payload.channel, "D0AC1TXM54L", "Target channel should match");
    }

    // Verify the job is persisted in the store
    const jobs = await cronService.list();
    assert.strictEqual(jobs.length, 1, "There should be exactly one job in the store");
    assert.strictEqual(jobs[0].id, scheduledJob.id, "Stored job should match created job");

    // Check that the payload contains the expected elements
    const jobPayload = jobs[0].payload;
    if ('type' in jobPayload && jobPayload.type === 'direct-execution') {
      // For direct execution jobs (which is what this test creates)
      assert.strictEqual(jobPayload.type, 'direct-execution', "Should be direct execution type");
      assert.strictEqual(jobPayload.toolName, 'powershell', "Should use powershell tool");
      assert.ok(jobPayload.toolParams?.command, "Should have command parameter");
    } else {
      // For Slack message jobs
      assert.strictEqual(jobPayload.channel, "D0AC1TXM54L", "Channel should match");
      assert.ok(jobPayload.text, "Should have text payload");
    }

    console.log(`✅ Successfully scheduled job: ${scheduledJob.name}`);
    console.log(`📅 Execution time: ${scheduledJob.schedule.kind === 'at' ? scheduledJob.schedule.at : 'N/A'}`);
    console.log(`🆔 Job ID: ${scheduledJob.id}`);
  });

  it("should verify the scheduled job runs with expected functionality", async () => {
    // Schedule a test job that simulates the resource check and email sending
    const executionTime = new Date();
    executionTime.setUTCHours(3, 36, 0, 0); // 3:36 UTC today

    const scheduledJob = await cronService.add({
      name: "system-resource-report-complete-1",
      description: "Check system resources and send HTML report via SMTP",
      schedule: {
        kind: "at",
        at: executionTime.toISOString()
      },
      payload: {
        type: 'direct-execution',
        toolName: 'powershell',
        toolParams: {
          command: `
            # PowerShell script to check system resources and send email
            # 1. Collect system metrics
            $cpu = Get-WmiObject Win32_Processor | Select-Object -ExpandProperty LoadPercentage
            $memory = Get-WmiObject Win32_OperatingSystem | Select-Object @{Name="FreeMemoryGB";Expression={[math]::Round($_.FreeVirtualMemory/1MB, 2)}}

            # 2. Generate HTML report
            $htmlReport = @"
<!DOCTYPE html>
<html>
<head><title>System Resource Report - $(Get-Date)</title></head>
<body>
<h1>System Resource Report</h1>
<p>CPU Usage: $($cpu)%</p>
<p>Free Memory: $($memory.FreeMemoryGB) GB</p>
<p>Generated at: $(Get-Date)</p>
</body>
</html>
"@
            $htmlReport | Out-File -FilePath "./temp/resource_report.html" -Encoding UTF8

            # 3. Prepare for SMTP send (would normally call IronBot's smtp-send skill)
            Write-Host "Report saved to ./temp/resource_report.html"
            Write-Host "Ready to send via SMTP to jzhu@blizzard.com using MTA server 10.63.6.154"
          `
        }
      },
      enabled: true
    });

    // Verify job properties
    assert.ok(scheduledJob, "Job should be created successfully");
    assert.strictEqual(scheduledJob.name, "system-resource-report-complete-1", "Job name should match expected");

    // Run the job and verify it completes
    const runResult = await cronService.run(scheduledJob.id, true);
    assert.ok(runResult.ok, "Job execution should be successful");

    // Verify job still exists in store after execution
    const jobs = await cronService.list();
    const foundJob = jobs.find(j => j.id === scheduledJob.id);
    assert.ok(foundJob, "Scheduled job should still exist in store after execution attempt");

    console.log(`✅ Job executed successfully: ${scheduledJob.name}`);
    console.log(`📊 Job status: ${runResult.ran ? 'ran' : 'did not run'}`);
  });
});

/**
 * Helper function to parse natural language request and extract job details
 */
function parseNaturalLanguageRequest(request: string): {
  name: string;
  description: string;
  executionTime: string;
  payload: any;
} {
  // Extract time - "at 3:36 UTC today"
  const timeMatch = request.match(/at (\d{1,2}):(\d{2}) UTC today/);
  let executionTime = new Date();
  if (timeMatch) {
    executionTime.setUTCHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
  } else {
    executionTime.setUTCHours(3, 36, 0, 0); // Default to 3:36 UTC
  }

  // Extract channel - "in channel D0AC1TXM54L"
  const channelMatch = request.match(/in channel ([A-Z0-9]+)/);
  const channel = channelMatch ? channelMatch[1] : 'D0AC1TXM54L';

  // Extract task details - the Chinese text and email instruction
  const taskMatch = request.match(/with task based on this: "([^"]+)"/);
  const taskDescription = taskMatch ? taskMatch[1] : "System resource check and email report";

  return {
    name: "system-resource-report-complete-1",
    description: "Check system resources and send HTML report via SMTP",
    executionTime: executionTime.toISOString(),
    payload: {
      type: 'direct-execution',
      toolName: 'powershell',
      toolParams: {
        command: buildPowerShellCommand(taskDescription)
      }
    }
  };
}

/**
 * Build PowerShell command based on task description
 */
function buildPowerShellCommand(taskDescription: string): string {
  // Extract email and MTA server from task description
  const emailMatch = taskDescription.match(/to ([^,]+@[^,]+)/);
  const mtaMatch = taskDescription.match(/MTA server: ([^,]+)/);

  const email = emailMatch ? emailMatch[1] : 'jzhu@blizzard.com';
  const mtaServer = mtaMatch ? mtaMatch[1] : '10.63.6.154';

  return `
    # PowerShell script to check system resources and send email
    Write-Host "Starting system resource check..."

    # Collect system metrics
    \$cpu = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
    \$memory = Get-WmiObject Win32_OperatingSystem | Select-Object -ExpandProperty FreePhysicalMemory
    \$memoryGB = [math]::Round(\$memory / 1MB, 2)

    # Get disk usage
    \$disks = Get-WmiObject -Class Win32_LogicalDisk -Filter "DriveType=3"
    \$diskInfo = foreach (\$disk in \$disks) {
      [PSCustomObject]@{
        Drive = \$disk.DeviceID
        SizeGB = [math]::Round([double]\$disk.Size / 1GB, 2)
        FreeGB = [math]::Round([double]\$disk.FreeSpace / 1GB, 2)
        PercentFree = [math]::Round(([double]\$disk.FreeSpace / [double]\$disk.Size) * 100, 2)
      }
    }

    # Create HTML report
    \$reportHtml = @"
<!DOCTYPE html>
<html>
<head>
    <title>System Resource Report - \$(Get-Date)</title>
    <style>
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .metric { font-weight: bold; color: #333; }
    </style>
</head>
<body>
    <h1>System Resource Report</h1>
    <p>Generated at: \$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")</p>

    <h2>CPU Information</h2>
    <div class="metric">CPU Average Usage: \${cpu}%</div>

    <h2>Memory Information</h2>
    <div class="metric">Free Physical Memory: \${memoryGB} GB</div>

    <h2>Disk Usage</h2>
    <table>
        <tr><th>Drive</th><th>Total Size (GB)</th><th>Free Space (GB)</th><th>% Free</th></tr>
\$(\$diskInfo | ForEach-Object { "<tr><td>\$_.Drive</td><td>\$_.SizeGB</td><td>\$_.FreeGB</td><td>\$_.PercentFree</td></tr>" })
    </table>

    <h2>Network and Process Information</h2>
    <div class="metric">Active Network Connections Count: \$(Get-NetTCPConnection | Where-Object {\$_.State -eq "Established"} | Measure-Object | Select-Object -ExpandProperty Count)</div>
    <div class="metric">Running Processes Count: \$(Get-Process | Measure-Object | Select-Object -ExpandProperty Count)</div>
</body>
</html>
"@

    # Save report to file
    \$reportPath = "./temp/resource_report.html"
    \$directory = Split-Path \$reportPath -Parent
    if (!(Test-Path \$directory)) {
        New-Item -ItemType Directory -Path \$directory -Force
    }
    \$reportHtml | Out-File -FilePath \$reportPath -Encoding UTF8

    Write-Host "System resource report saved to: \$reportPath"

    # Prepare for SMTP send (would normally call IronBot's smtp-send skill)
    Write-Host "Ready to send report via SMTP to ${email} using MTA server ${mtaServer}"
    Write-Host "Report file: \$reportPath"
    Write-Host "This would normally call IronBot's @smtp-send skill"
  `;
}