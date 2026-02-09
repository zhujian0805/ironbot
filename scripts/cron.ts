import { Command } from "commander";
import {
  CronJobCreate,
  CronJob,
  CronStoreFile,
} from "../src/cron/types.ts";
import { readCronRunLogEntries, resolveCronRunLogPath } from "../src/cron/run-log.ts";
import { resolveCronStorePath, loadCronStore, saveCronStore } from "../src/cron/store.ts";
import { parseAbsoluteTimeMs } from "../src/cron/parse.ts";
import { createJob, computeJobNextRunAtMs } from "../src/cron/service/jobs.ts";
import { ensureJobInStore } from "../src/cron/store_verification.ts";

const DEFAULT_STORE_ENV = process.env.IRONBOT_CRON_STORE_PATH;

type JobScheduleInput = {
  schedule: CronJobCreate["schedule"];
  threadTs?: string;
};

const program = new Command();
program
  .name("ironbot-cron")
  .description("Manage scheduled cron reminders for IronBot")
  .option("--store <path>", "Override cron store path", DEFAULT_STORE_ENV);

const resolveStorePath = (): string =>
  resolveCronStorePath(program.opts().store ?? DEFAULT_STORE_ENV);

const loadStore = async (): Promise<CronStoreFile> => {
  const storePath = resolveStorePath();
  console.log(`Loading cron store from ${storePath}`);
  const store = await loadCronStore(storePath);
  console.log(`Loaded store with ${store.jobs.length} jobs`);
  return store;
};

const saveStore = async (store: CronStoreFile) => {
  const storePath = resolveStorePath();
  console.log(`Saving cron store to ${storePath} with ${store.jobs.length} jobs`);
  await saveCronStore(storePath, store);
  console.log(`Successfully saved cron store`);
};

const error = (message: string): never => {
  console.error(`error: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
};

const parseDurationMs = (value: string): number | null => {
  const raw = value.trim();
  if (!raw) {
    return null;
  }
  const match = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i);
  if (!match) {
    return null;
  }
  const n = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  const unit = (match[2] ?? "").toLowerCase();
  const factor =
    unit === "ms"
      ? 1
      : unit === "s"
        ? 1000
        : unit === "m"
          ? 60_000
          : unit === "h"
            ? 3_600_000
            : 86_400_000;
  return Math.floor(n * factor);
};

const parseAt = (value: string): string | null => {
  const raw = value.trim();
  if (!raw) {
    return null;
  }
  const absolute = parseAbsoluteTimeMs(raw);
  if (absolute !== null) {
    return new Date(absolute).toISOString();
  }
  const duration = parseDurationMs(raw);
  if (duration !== null) {
    return new Date(Date.now() + duration).toISOString();
  }
  return null;
};

const buildSchedule = (opts: {
  at?: string;
  every?: string;
  cron?: string;
  tz?: string;
}): CronJobCreate["schedule"] => {
  const choices = [Boolean(opts.at), Boolean(opts.every), Boolean(opts.cron)].filter(Boolean);
  if (choices.length !== 1) {
    error("Specify exactly one schedule: --at, --every, or --cron");
  }
  if (opts.at) {
    const iso = parseAt(opts.at);
    if (!iso) {
      error("Invalid --at value; use ISO timestamps or duration (e.g., 20m)");
    }
    return { kind: "at", at: iso };
  }
  if (opts.every) {
    const duration = parseDurationMs(opts.every);
    if (!duration) {
      error("Invalid --every value; use units ms/s/m/h/d");
    }
    return { kind: "every", everyMs: duration };
  }
  return { kind: "cron", expr: opts.cron!.trim(), tz: opts.tz?.trim() || undefined };
};

const formatDuration = (ms: number) => {
  if (ms < 60_000) {
    return `${Math.max(1, Math.round(ms / 1000))}s`;
  }
  if (ms < 3_600_000) {
    return `${Math.round(ms / 60_000)}m`;
  }
  if (ms < 86_400_000) {
    return `${Math.round(ms / 3_600_000)}h`;
  }
  return `${Math.round(ms / 86_400_000)}d`;
};

const formatRelative = (ms: number | undefined) => {
  if (!ms) {
    return "-";
  }
  const delta = ms - Date.now();
  if (delta >= 0) {
    return `in ${formatDuration(delta)}`;
  }
  return `${formatDuration(Math.abs(delta))} ago`;
};

const formatSchedule = (schedule: CronJobCreate["schedule"]) => {
  if (schedule.kind === "at") {
    return `at ${schedule.at}`;
  }
  if (schedule.kind === "every") {
    return `every ${formatDuration(schedule.everyMs)}`;
  }
  return schedule.tz ? `cron ${schedule.expr} @ ${schedule.tz}` : `cron ${schedule.expr}`;
};

const formatJobRow = (job: CronJob) => {
  const idLabel = job.id.slice(0, 8);
  const status = job.enabled ? job.state.lastStatus ?? "idle" : "disabled";
  const next = job.state.nextRunAtMs ? formatRelative(job.state.nextRunAtMs) : "-";
  return `${idLabel}\t${job.name}\t${formatSchedule(job.schedule)}\t${next}\t${status}\t${job.payload.channel}`;
};

program
  .command("status")
  .description("Show cron store metadata")
  .action(async () => {
    const storePath = resolveStorePath();
    const store = await loadStore();
    console.log(`Cron store: ${storePath}`);
    console.log(`Jobs: ${store.jobs.length}`);
  });

program
  .command("list")
  .description("List cron jobs")
  .action(async () => {
    const store = await loadStore();
    if (store.jobs.length === 0) {
      console.log("No cron jobs configured.");
      return;
    }
    const rows = store.jobs
      .slice()
      .sort((a, b) => (a.state.nextRunAtMs ?? Infinity) - (b.state.nextRunAtMs ?? Infinity))
      .map(formatJobRow);
    console.log("ID\tName\tSchedule\tNext\tStatus\tChannel");
    for (const row of rows) {
      console.log(row);
    }
  });

program
  .command("runs <jobId>")
  .description("Show recent run history for a cron job")
  .option("--limit <number>", "Maximum entries to show (1-5000)")
  .action(async (jobId, opts) => {
    const parsed = Number.parseInt(opts.limit ?? "", 10);
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 5000) : 20;
    const storePath = resolveStorePath();
    const logPath = resolveCronRunLogPath({ storePath, jobId });
    const entries = await readCronRunLogEntries(logPath, { limit, jobId });
    if (entries.length === 0) {
      console.log(`No run history for job ${jobId}.`);
      return;
    }
    console.log("Timestamp\tStatus\tDuration\tNext run\tSummary");
    for (const entry of entries) {
      const timestamp = new Date(entry.ts).toISOString();
      const status = entry.status ?? "unknown";
      const duration = typeof entry.durationMs === "number" ? `${entry.durationMs}ms` : "-";
      const nextRun = entry.nextRunAtMs ? new Date(entry.nextRunAtMs).toISOString() : "-";
      const summary = entry.summary ?? entry.error ?? "-";
      console.log(`${timestamp}\t${status}\t${duration}\t${nextRun}\t${summary}`);
    }
  });

program
  .command("add")
  .description("Add a cron reminder")
  .requiredOption("--name <name>", "Name for the job")
  .option("--channel <channel>", "Slack channel ID (C..., D..., etc.) for notifications (optional for direct execution)")
  .option("--text <text>", "Message to send to Slack channel")
  .option("--tool <toolName>", "Tool to execute directly (e.g., run_powershell, run_bash)")
  .option("--tool-param <key=value...>", "Parameters for the tool execution (format: key=value)", (val, prev) => {
    const [key, value] = val.split('=');
    if (key && value !== undefined) {
      prev[key] = value;
    }
    return prev;
  }, {})
  .option("--description <text>", "Optional description")
  .option("--details <text>", "Optional narrative describing what the job does")
  .option("--thread-ts <ts>", "Post inside an existing thread")
  .option("--at <when>", "Run once at ISO time or duration like 20m")
  .option("--every <duration>", "Run every duration (e.g., 5m)")
  .option("--cron <expr>", "Cron expression (5-field)")
  .option("--tz <iana>", "Timezone for cron expressions")
  .option("--disabled", "Create the job disabled", false)
  .option("--delete-after-run", "Remove one-shot job after it succeeds", false)
  .action(async (opts) => {
    const schedule = buildSchedule({ at: opts.at, every: opts.every, cron: opts.cron, tz: opts.tz });

    let payload;
    if (opts.tool) {
      // Direct execution payload
      if (opts.channel) {
        console.log(`Creating direct execution job with tool '${opts.tool}' and Slack notification to channel '${opts.channel}'`);
      } else {
        console.log(`Creating direct execution job with tool '${opts.tool}' (no Slack notification)`);
      }
      payload = {
        type: "direct-execution" as const,
        toolName: opts.tool,
        toolParams: opts.toolParam || {}
      };
    } else {
      // Slack message payload (requires channel and text)
      if (!opts.channel) {
        error("For Slack message jobs, you must specify --channel");
      }
      if (!opts.text) {
        error("For Slack message jobs, you must specify --text");
      }
      payload = {
        channel: opts.channel,
        text: opts.text,
        threadTs: opts.threadTs,
      };
      console.log(`Creating Slack message job to channel '${opts.channel}'`);
    }

    const storePath = resolveStorePath();
    const store = await loadStore();
    const jobInput: CronJobCreate = {
      name: opts.name,
      description: opts.description,
      details: opts.details,
      enabled: !opts.disabled,
      deleteAfterRun: opts.deleteAfterRun || undefined,
      schedule,
      payload,
      state: {},
    };
    const job = createJob(jobInput, Date.now());
    store.jobs.push(job);
    await saveStore(store);
    const persistedJob = await ensureJobInStore(storePath, job.id);
    console.log(`Created job ${persistedJob.id} (${persistedJob.name})`);
  });

const toggleJob = async (id: string, enabled: boolean) => {
  const store = await loadStore();
  const job = store.jobs.find((entry) => entry.id === id);
  if (!job) {
    error(`job not found: ${id}`);
  }
  job.enabled = enabled;
  if (enabled) {
    job.state.nextRunAtMs = computeJobNextRunAtMs(job, Date.now());
  } else {
    job.state.nextRunAtMs = undefined;
  }
  job.updatedAtMs = Date.now();
  await saveStore(store);
  console.log(`${enabled ? "Enabled" : "Disabled"} job ${id}`);
};

program
  .command("enable <id>")
  .description("Enable a cron job")
  .action(async (id) => {
    await toggleJob(id, true);
  });

program
  .command("disable <id>")
  .description("Disable a cron job")
  .action(async (id) => {
    await toggleJob(id, false);
  });

program
  .command("remove <id>")
  .description("Remove a cron job")
  .action(async (id) => {
    const store = await loadStore();
    const before = store.jobs.length;
    store.jobs = store.jobs.filter((job) => job.id !== id);
    if (store.jobs.length === before) {
      error(`job not found: ${id}`);
    }
    await saveStore(store);
    console.log(`Removed job ${id}`);
  });

program.parseAsync(process.argv).catch((err) => {
  if (!process.exitCode) {
    process.exitCode = 1;
  }
  console.error(String(err));
});
