import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCronStore, resolveCronStorePath } from "../../src/cron/store.ts";
import type { CronJob } from "../../src/cron/types.ts";
import type { SkillContext } from "../../src/services/skill_context.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const slugifyJobName = (value: string): string => {
  const sanitized = value
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (!sanitized) {
    return `cron-job-${Date.now().toString(36)}`;
  }
  return sanitized;
};

const stripQuotes = (value: string): string =>
  value.replace(/^[\"'\u201c\u201d]+|[\"'\u201c\u201d]+$/g, "").trim();

const parseJobName = (input: string): string | null => {
  const namePatterns = [
    /named\s+"([^"]+)"/i,
    /named\s+'([^']+)'/i,
    /named\s+([\w-]+)/i,
    /job name\s+(?:is\s*)?"([^"]+)"/i,
    /job name\s+(?:is\s*)?'([^']+)'/i,
    /job name\s+(?:is\s*)?([\w-]+)/i,
    /called\s+"([^"]+)"/i,
    /called\s+'([^']+)'/i,
    /called\s+([\w-]+)/i,
  ];
  for (const pattern of namePatterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      return stripQuotes(match[1]);
    }
  }
  return null;
};

const parseChannelId = (input: string): string | null => {
  const match = input.match(/\b([CDG][A-Z0-9]{8,})\b/);
  return match ? match[1] : null;
};

const parseMessageText = (input: string): string | null => {
  const keyMarkers = ["task", "message", "text", "payload", "body", "details"];
  const lower = input.toLowerCase();
  for (const marker of keyMarkers) {
    const markerIndex = lower.indexOf(`${marker}:`);
    if (markerIndex !== -1) {
      const slice = input.slice(markerIndex + marker.length + 1).trim();
      if (!slice) continue;
      const quoteMatch = stripQuotes(slice).trim();
      if (quoteMatch) {
        return quoteMatch;
      }
      return slice.split(/[\n\r]/, 1)[0].trim();
    }
  }
  const quoted = input.match(/["'\u201c\u201d]([^"'\u201c\u201d]+)["'\u201c\u201d]/);
  if (quoted && quoted[1]) {
    return quoted[1].trim();
  }

  // Check if the input suggests direct execution
  const executionIndicators = ['run ', 'execute ', 'script:', 'powershell', 'bash:', 'command:', '.ps1', '.sh'];
  for (const indicator of executionIndicators) {
    if (input.toLowerCase().includes(indicator)) {
      return null; // Don't extract text for direct execution
    }
  }

  return input.trim() || null;
};

// New function to detect if user wants direct execution
const detectDirectExecution = (input: string): { isDirect: boolean; toolName?: string; command?: string } | null => {
  const lower = input.toLowerCase();

  // Look for any indication of wanting to run/execute something - broad pattern matching
  const executionIndicators = [
    /\brun\s+/i,           // run something
    /\bexecute\s+/i,       // execute something
    /\bscript/i,           // script related
    /\bautomat/i,          // automation related
    /\btask/i,             // task related
    /\bcommand/i,          // command related
    /\bprogram/i,          // program related
    /\btool/i,             // tool related
    /\bservice/i,          // service related
    /\.ps1\b/i,            // PowerShell file
    /\.sh\b/i,             // Shell script
    /\.bat\b/i,            // Batch file
    /\.exe\b/i,            // Executable
    /\bpowershell/i,       // PowerShell command
    /\bcmd\b/i,            // Command prompt
    /\bshell/i,            // Shell
    /\bcheck\b/i,          // Check operation
    /\bmonitor/i,          // Monitor operation
    /\breport/i,           // Report generation
    /\bsave/i,             // Save operation
    /\bfile/i,             // File operation
    /\bemail/i,            // Email operation
    /\bsend/i,             // Send operation
    /\bhtml/i,             // HTML generation
    /\bnetwork/i,          // Network operation
    /\bsystem/i,           // System operation
    /\bprocess/i,          // Process operation
    /\bdata/i,             // Data operation
    /\banalysis/i,         // Analysis operation
    /\bgenerate/i,         // Generation operation
    /\bcreate/i,           // Creation operation
    /\bdownload/i,         // Download operation
    /\bupload/i,           // Upload operation
    /\bbackup/i,           // Backup operation
    /\brestore/i,          // Restore operation
  ];

  // Check if input contains any execution-related patterns
  for (const pattern of executionIndicators) {
    if (pattern.test(input)) {
      // For any kind of execution task, prefer TypeScript
      return {
        isDirect: true,
        toolName: 'run_bash',
        command: 'npx tsx generic_task.ts'  // Generic TS script for any task
      };
    }
  }

  // Check for TypeScript execution if explicitly mentioned (highest priority)
  if (lower.includes('typescript') || lower.includes('.ts') || lower.includes('run typescript') || lower.includes('ts-node') || lower.includes('tsx')) {
    const match = input.match(/(run|execute|typescript|ts-node|tsx).*?((?:\.\/)?\S+\.ts|\w+:\\\S+\.ts)/i);
    if (match) {
      return {
        isDirect: true,
        toolName: 'run_bash', // Using run_bash to execute TypeScript with tsx
        command: `npx tsx ${match[2].trim()}`
      };
    }
    // Fallback: if it mentions typescript but no specific file, try to extract a command
    const extractedCmd = input.replace(/.*?(run|execute|typescript|ts-node|tsx)\s*/i, '').trim();
    return {
      isDirect: true,
      toolName: 'run_bash',
      command: `npx tsx ${extractedCmd || 'script.ts'}`
    };
  }

  // Check for PowerShell execution (fallback)
  if (lower.includes('powershell') || lower.includes('.ps1') || lower.includes('run powershell')) {
    const match = input.match(/(run|execute|powershell).*?((?:\.\/)?\S+\.ps1|\w+:\\\S+\.ps1)/i);
    if (match) {
      return {
        isDirect: true,
        toolName: 'run_powershell',
        command: match[2].trim()
      };
    }
    // Fallback: if it mentions powershell but no specific script, try to extract a command
    return {
      isDirect: true,
      toolName: 'run_powershell',
      command: input.replace(/.*?(run|execute|powershell)\s*/i, '').trim()
    };
  }

  // Check for bash execution (fallback)
  if (lower.includes('bash') || lower.includes('.sh') || lower.includes('run bash')) {
    const match = input.match(/(run|execute|bash).*?((?:\.\/)?\S+\.sh|\w+:\\\S+\.sh)/i);
    if (match) {
      return {
        isDirect: true,
        toolName: 'run_bash',
        command: match[2].trim()
      };
    }
  }

  return null;
};


const parseCronExpression = (input: string): string | null => {
  const cronTrigger = input.match(/cron(?: expression)?/i);
  if (!cronTrigger) return null;
  const remainder = input.slice(cronTrigger.index! + cronTrigger[0].length).trim();
  if (!remainder) return null;
  let expr = "";
  if (["\"", "'", "\u201c", "\u201d"].includes(remainder[0])) {
    const quote = remainder[0];
    const closing = remainder.indexOf(quote, 1);
    if (closing > 1) {
      expr = remainder.slice(1, closing).trim();
    }
  }
  if (!expr) {
    const firstLine = remainder.split(/[\r\n]/)[0];
    expr = firstLine.split(/[.,;]| and | for /i)[0].trim();
  }
  if (!expr) return null;
  const tokens = expr.split(/\s+/).filter(Boolean);
  if (tokens.length < 5) {
    return null;
  }
  return tokens.slice(0, 5).join(" ");
};


const parseSchedule = (
  input: string
): { kind: "cron"; value: string } | null => {
  const cron = parseCronExpression(input);
  if (cron) {
    return { kind: "cron", value: cron };
  }
  return null;
};

const formatChannelMention = (channel: string): string => {
  if (!channel) return channel;
  if (channel.startsWith("C") || channel.startsWith("G")) {
    return `<#${channel}>`;
  }
  return channel;
};

type CronAddExtras = {
  description?: string;
  details?: string;
  threadTs?: string;
};

export const resolveChannelFromInput = (input: string, context?: SkillContext): string | null => {
  return parseChannelId(input) ?? context?.channel ?? null;
};

type SlackMetadata = {
  description: string;
  details?: string;
  threadTs?: string;
  scheduledBy: string;
  location: string;
};

export const buildSlackMetadata = (context?: SkillContext, input?: string): SlackMetadata => {
  const scheduledBy = context?.userId ? `<@${context.userId}>` : "Slack user";
  const locationParts: string[] = [];
  if (context?.channel) {
    locationParts.push(formatChannelMention(context.channel));
  }
  if (context?.threadTs) {
    locationParts.push(`thread ${context.threadTs}`);
  }
  const location = locationParts.length ? locationParts.join(" / ") : "Slack conversation";
  const description = `Scheduled via Slack by ${scheduledBy} in ${location}.`;
  const details = input ? `Original request: ${input}` : undefined;
  return {
    description,
    details,
    threadTs: context?.threadTs,
    scheduledBy,
    location
  };
};

export const buildCronAddArgs = (
  jobName: string,
  channel: string | null, // Channel is optional for direct execution
  text: string | null,    // Text is optional for direct execution
  schedule: { kind: string; value: string },
  extras?: CronAddExtras,
  directExec?: { toolName: string; command: string }, // Optional direct execution parameters
  storePath?: string
): string[] => {
  const args: string[] = ["run", "cron", "--"];
  if (storePath) {
    args.push("--store", storePath);
  }

  if (directExec) {
    args.push(
      "add",
      "--name",
      jobName,
      "--tool",
      directExec.toolName,
      "--tool-param",
      `command=${directExec.command}`
    );
  } else {
    args.push(
      "add",
      "--name",
      jobName,
      "--channel",
      channel!,
      "--text",
      text!
    );
  }

  if (extras?.threadTs) {
    args.push("--thread-ts", extras.threadTs);
  }
  if (extras?.description) {
    args.push("--description", extras.description);
  }
  if (extras?.details) {
    args.push("--details", extras.details);
  }
  if (schedule.kind === "cron") {
    args.push("--cron", schedule.value);
  }
  return args;
};

const runCronAddCommand = async (
  jobName: string,
  channel: string | null, // Can be null for direct execution
  text: string | null,    // Can be null for direct execution
  schedule: { kind: string; value: string },
  extras?: CronAddExtras,
  directExec?: { toolName: string; command: string }, // Optional direct execution parameters
  storePath?: string
) => {
  const args = buildCronAddArgs(jobName, channel, text, schedule, extras, directExec, storePath);
  const child = spawn("npm", args, { cwd: repoRoot, env: process.env });
  let stdout = "";
  let stderr = "";
  return new Promise<{ success: boolean; stdout: string; stderr: string }>((resolve) => {
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ success: code === 0, stdout, stderr });
    });
  });
};

const describeSchedule = (schedule: { kind: string; value: string }): string => {
  return `cron expression ${schedule.value}`;
};

const formatNextRun = (job: CronJob): string => {
  if (!job.state?.nextRunAtMs) {
    return "unknown";
  }
  return new Date(job.state.nextRunAtMs).toLocaleString("en-US", { timeZoneName: "short" });
};

export const executeSkill = async (input: string, context?: SkillContext): Promise<string> => {
  const cleanedInput = input.trim();
  if (!cleanedInput) {
    return "Please tell me what reminder you want to schedule.";
  }

  console.log(`[DEBUG] cron-scheduler: processing input: "${cleanedInput}"`);

  // Check if user wants direct execution (like PowerShell scripts)
  const directExec = detectDirectExecution(cleanedInput);
  // Enforce absolute paths for direct-execution commands per SKILL.md
  if (directExec?.isDirect && directExec.command) {
    const parts = directExec.command.split(/\s+/);
    // Check if the first part (executable/script) looks like a file that needs to be resolved to absolute path
    const firstPart = parts[0];
    if (firstPart && !path.isAbsolute(firstPart) &&
        (firstPart.includes('./') || firstPart.includes('../') || firstPart.includes('.\\') ||
         ['.ts', '.js', '.ps1', '.sh', '.bat', '.exe'].some(ext => firstPart.toLowerCase().endsWith(ext)))) {
      parts[0] = path.resolve(repoRoot, firstPart).replace(/\\/g, "/");
      directExec.command = parts.join(" ");
    }
  }

  console.log(`[DEBUG] cron-scheduler: direct execution detected: ${directExec ? 'yes' : 'no'}`);

  let channel: string | null = null;
  let parsedText: string | null = null;

  if (!directExec) {
    // Traditional behavior: requires channel and text
    channel = resolveChannelFromInput(cleanedInput, context);
    if (!channel) {
      return "I could not determine which channel to post this reminder in. Please specify a channel ID (e.g., C12345678) or run this command inside the desired channel/thread.";
    }

    parsedText = parseMessageText(cleanedInput);
    if (!parsedText) {
      return "I could not figure out what message you want to send. Please describe the reminder text.";
    }
  }

  console.log(`[DEBUG] cron-scheduler: channel: ${channel}, text: ${parsedText}`);

  const schedule = parseSchedule(cleanedInput);
  if (!schedule) {
    return "I need a cron schedule (five-field cron expression, plus optional --tz).";
  }

  console.log(`[DEBUG] cron-scheduler: schedule parsed: ${JSON.stringify(schedule)}`);

  const metadata = buildSlackMetadata(context, cleanedInput);
  const extras: CronAddExtras = {
    threadTs: metadata.threadTs,
    description: metadata.description,
    details: metadata.details
  };

  // Extract job name based on execution type
  const inferredName = parseJobName(cleanedInput) ??
                       (directExec ? slugifyJobName(directExec.toolName + "-" + directExec.command) :
                        slugifyJobName(parsedText!));

  console.log(`[DEBUG] cron-scheduler: inferred job name: ${inferredName}`);

  const storePath = resolveCronStorePath(process.env.IRONBOT_CRON_STORE_PATH);

  console.log(`[DEBUG] cron-scheduler: running cron add command`);

  const { success, stdout, stderr } = await runCronAddCommand(
    inferredName,
    channel,
    parsedText,
    schedule,
    extras,
    directExec && directExec.isDirect ? { toolName: directExec.toolName!, command: directExec.command! } : undefined,
    storePath
  );

  console.log(`[DEBUG] cron-scheduler: command result - success: ${success}, stdout length: ${stdout.length}, stderr length: ${stderr.length}`);

  if (!success) {
    const message = stderr || stdout || "Cron command failed to run.";
    return `❌ Unable to schedule the reminder: ${message.split(/\r?\n/)[0]}`;
  }

  const jobMatch = stdout.match(/Created job ([0-9a-f-]+)/i);
  const jobId = jobMatch ? jobMatch[1] : null;
  if (!jobId) {
    return "✅ The cron job seems to have been created, but I could not parse the job ID.";
  }

  console.log(`[DEBUG] cron-scheduler: job created with ID: ${jobId}`);

  const store = await loadCronStore(storePath);
  const job = store.jobs.find((entry) => entry.id === jobId);
  if (!job) {
    return `✅ Cron job ${inferredName} created (ID ${jobId}), but I could not find it in ${storePath}.`;
  }

  console.log(`[DEBUG] cron-scheduler: job found in store: ${job.name}`);

  const threadLine = metadata.threadTs ? `- Thread: ${metadata.threadTs}` : "- Thread: main conversation";
  const scheduledByLine = `- Scheduled by: ${metadata.scheduledBy}`;

  // Customize response based on execution type
  if (directExec) {
    return [
      `✅ Scheduled direct execution job **${job.name}** (ID ${job.id})`,
      `- Schedule: ${describeSchedule(schedule)}`,
      `- Tool: ${directExec.toolName}`,
      `- Command: ${directExec.command}`,
      threadLine,
      scheduledByLine,
      `- Next run: ${formatNextRun(job)}`,
      `Stored at: ${storePath}`,
      "The script will run automatically at the scheduled time without manual intervention."
    ].join("\n");
  } else {
    // For Slack message jobs, verify the payload has the expected structure
    if ('channel' in job.payload && 'text' in job.payload) {
      const channelLabel = formatChannelMention(job.payload.channel);
      return [
        `✅ Scheduled cron reminder **${job.name}** (ID ${job.id})`,
        `- Channel: ${channelLabel}`,
        threadLine,
        scheduledByLine,
        `- Schedule: ${describeSchedule(schedule)}`,
        `- Next run: ${formatNextRun(job)}`,
        `- Message: ${job.payload.text}`,
        `Stored at: ${storePath}`,
        "You can inspect or manage it with `npm run cron -- list` or `npm run cron -- remove <job-id>`."
      ].join("\n");
    } else {
      // Handle the case where payload is direct execution but shouldn't be (shouldn't happen with proper control flow)
      return [
        `✅ Scheduled cron job **${job.name}** (ID ${job.id})`,
        `- Schedule: ${describeSchedule(schedule)}`,
        `- Next run: ${formatNextRun(job)}`,
        `Stored at: ${storePath}`,
        "You can inspect or manage it with `npm run cron -- list` or `npm run cron -- remove <job-id>`."
      ].join("\n");
    }
  }
};

const runCronRemoveCommand = async (jobId: string) => {
  const args = ["run", "cron", "--", "remove", jobId];
  const child = spawn("npm", args, { cwd: repoRoot, env: process.env });
  let stdout = "";
  let stderr = "";
  return new Promise<{ success: boolean; stdout: string; stderr: string }>((resolve) => {
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ success: code === 0, stdout, stderr });
    });
  });
};

export const removeSkill = async (jobId: string): Promise<string> => {
  if (!jobId) {
    return "Please provide a job ID to remove.";
  }

  const { success, stdout, stderr } = await runCronRemoveCommand(jobId);

  if (!success) {
    const message = stderr || stdout || "Cron remove command failed to run.";
    return `❌ Unable to remove the cron job: ${message.split(/\r?\n/)[0]}`;
  }

  return `✅ Successfully removed cron job: ${stdout.trim()}`;
};

export { parseSchedule };
