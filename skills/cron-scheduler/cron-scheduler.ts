import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCronStore, resolveCronStorePath } from "../../src/cron/store.ts";
import type { CronJob } from "../../src/cron/types.ts";

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
  return input.trim() || null;
};

const parseEverySchedule = (input: string): string | null => {
  const match = input.match(/every\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)\b/i);
  if (!match) return null;
  const amount = match[1];
  const unit = match[2].toLowerCase();
  const mappedUnit = unit.startsWith("s")
    ? "s"
    : unit.startsWith("m")
      ? "m"
      : unit.startsWith("h")
        ? "h"
        : unit.startsWith("d")
          ? "d"
          : "m";
  return `${amount}${mappedUnit}`;
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

const parseAtSchedule = (input: string): string | null => {
  const timeMatch = input.match(/at\s+(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)/i);
  if (!timeMatch) return null;
  const timePart = timeMatch[1];
  const cleanTime = timePart.replace(/\./g, "").toLowerCase();
  const dateTokens = input.match(/\b(today|tomorrow|tonight|this afternoon|this evening|this morning)\b/i);
  const now = new Date();
  const target = new Date(now);
  const lowerDateToken = dateTokens ? dateTokens[1].toLowerCase() : "";
  if (lowerDateToken.includes("tomorrow")) {
    target.setDate(target.getDate() + 1);
  }
  const parsedTime = cleanTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!parsedTime) return null;
  let hours = Number(parsedTime[1]);
  const minutes = parsedTime[2] ? Number(parsedTime[2]) : 0;
  const ampm = parsedTime[3];
  if (ampm) {
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
  }
  target.setHours(hours, minutes, 0, 0);
  if (!lowerDateToken && target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.toISOString();
};

const parseSchedule = (
  input: string
): { kind: "at"; value: string } | { kind: "every"; value: string } | { kind: "cron"; value: string } | null => {
  const every = parseEverySchedule(input);
  if (every) {
    return { kind: "every", value: every };
  }
  const cron = parseCronExpression(input);
  if (cron) {
    return { kind: "cron", value: cron };
  }
  const at = parseAtSchedule(input);
  if (at) {
    return { kind: "at", value: at };
  }
  return null;
};

const runCronAddCommand = async (
  jobName: string,
  channel: string,
  text: string,
  schedule: { kind: string; value: string }
) => {
  const args = ["run", "cron", "--", "add", "--name", jobName, "--channel", channel, "--text", text];
  if (schedule.kind === "at") {
    args.push("--at", schedule.value);
  } else if (schedule.kind === "every") {
    args.push("--every", schedule.value);
  } else if (schedule.kind === "cron") {
    args.push("--cron", schedule.value);
  }
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
  if (schedule.kind === "at") {
    return `at ${schedule.value}`;
  }
  if (schedule.kind === "every") {
    return `every ${schedule.value}`;
  }
  return `cron expression ${schedule.value}`;
};

const formatNextRun = (job: CronJob): string => {
  if (!job.state?.nextRunAtMs) {
    return "unknown";
  }
  return new Date(job.state.nextRunAtMs).toLocaleString("en-US", { timeZoneName: "short" });
};

export const executeSkill = async (input: string): Promise<string> => {
  const cleanedInput = input.trim();
  if (!cleanedInput) {
    return "Please tell me what reminder you want to schedule.";
  }

  const channel = parseChannelId(cleanedInput);
  if (!channel) {
    return "I could not find a Slack channel ID in your request. Please include an ID like C12345678 or D12345678.";
  }

  const parsedText = parseMessageText(cleanedInput);
  if (!parsedText) {
    return "I could not figure out what message you want to send. Please describe the reminder text.";
  }

  const schedule = parseSchedule(cleanedInput);
  if (!schedule) {
    return "I need a schedule (e.g., 'at 4:29 PM today', 'every 10 minutes', or a cron expression).";
  }

  const inferredName = parseJobName(cleanedInput) ?? slugifyJobName(parsedText);
  const { success, stdout, stderr } = await runCronAddCommand(inferredName, channel, parsedText, schedule);
  if (!success) {
    const message = stderr || stdout || "Cron command failed to run.";
    return `❌ Unable to schedule the reminder: ${message.split(/\r?\n/)[0]}`;
  }

  const jobMatch = stdout.match(/Created job ([0-9a-f-]+)/i);
  const jobId = jobMatch ? jobMatch[1] : null;
  if (!jobId) {
    return "✅ The cron reminder seems to have been created, but I could not parse the job ID.";
  }

  const storePath = resolveCronStorePath(process.env.IRONBOT_CRON_STORE_PATH);
  const store = await loadCronStore(storePath);
  const job = store.jobs.find((entry) => entry.id === jobId);
  if (!job) {
    return `✅ Cron reminder ${inferredName} created (ID ${jobId}), but I could not find it in ${storePath}.`;
  }

  return [
    `✅ Scheduled cron reminder **${job.name}** (ID ${job.id})`,
    `- Channel: ${job.payload.channel}`,
    `- Schedule: ${describeSchedule(schedule)}`,
    `- Next run: ${formatNextRun(job)}`,
    `- Message: ${job.payload.text}`,
    `Stored at: ${storePath}`,
    "You can inspect or manage it with `npm run cron -- list` or `npm run cron -- remove <job-id>`."
  ].join("\n");
};

export { parseSchedule };
