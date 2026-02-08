export type CronSchedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string };

export type CronMessagePayload = {
  channel: string;
  text: string;
  threadTs?: string;
  replyBroadcast?: boolean;
};

export type CronDirectExecutionPayload = {
  // Direct execution mode - no channel needed
  type: "direct-execution";
  toolName: string; // Name of the tool to execute (e.g., "run_powershell", "run_bash")
  toolParams: Record<string, unknown>; // Parameters for the tool
};

export type CronJobPayload = CronMessagePayload | CronDirectExecutionPayload;

export type CronJobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
  lastDurationMs?: number;
};

export type CronJob = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  payload: CronJobPayload;
  details?: string;
  state: CronJobState;
};

export type CronStoreFile = {
  version: 1;
  jobs: CronJob[];
};

export type CronJobCreate = Omit<CronJob, "id" | "createdAtMs" | "updatedAtMs" | "state"> & {
  state?: Partial<CronJobState>;
};

export type CronJobPatch = Partial<
  Pick<CronJob, "name" | "description" | "enabled" | "deleteAfterRun">
> & {
  schedule?: CronSchedule;
  payload?: Partial<CronMessagePayload>;
  details?: string;
  state?: Partial<CronJobState>;
};
