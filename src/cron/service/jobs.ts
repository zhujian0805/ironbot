import crypto from "node:crypto";
import type { CronJob, CronJobCreate, CronJobPatch } from "../types.ts";
import type { CronServiceState } from "./state.ts";
import { computeNextRunAtMs } from "../schedule.ts";

const normalizeRequiredName = (value: string): string => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    throw new Error("cron job requires a name");
  }
  return trimmed;
};

const normalizeOptionalDescription = (value: string | undefined): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizePayload = (payload: CronJobPayload) => {
  if ('type' in payload && payload.type === 'direct-execution') {
    // Validate direct execution payload
    if (!payload.toolName) {
      throw new Error("Direct execution payload requires a toolName");
    }
    if (typeof payload.toolParams !== 'object' || payload.toolParams === null) {
      throw new Error("Direct execution payload requires toolParams as an object");
    }

    return {
      type: payload.type,
      toolName: payload.toolName,
      toolParams: payload.toolParams
    };
  } else {
    // Validate Slack message payload
    const channel = (payload.channel ?? "").trim();
    const text = (payload.text ?? "").trim();
    if (!channel) {
      throw new Error("cron payload requires a channel for Slack messages");
    }
    if (!text) {
      throw new Error("cron payload requires text for Slack messages");
    }
    return {
      channel,
      text,
      threadTs: payload.threadTs?.trim() || undefined,
      replyBroadcast: Boolean(payload.replyBroadcast),
    };
  }
};

export const computeJobNextRunAtMs = (job: CronJob, nowMs: number): number | undefined =>
  job.enabled ? computeNextRunAtMs(job.schedule, nowMs) : undefined;

const summarizeDetails = (input: CronJobCreate): string | undefined =>
  input.details?.trim() || input.payload.text?.trim();

export const createJob = (input: CronJobCreate, nowMs: number): CronJob => {
  const job: CronJob = {
    id: crypto.randomUUID(),
    name: normalizeRequiredName(input.name),
    description: normalizeOptionalDescription(input.description),
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    deleteAfterRun: input.deleteAfterRun,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    schedule: input.schedule,
    payload: normalizePayload(input.payload),
    details: summarizeDetails(input),
    state: {
      ...input.state,
      nextRunAtMs: undefined,
    },
  };
  job.state.nextRunAtMs = computeJobNextRunAtMs(job, nowMs);
  return job;
};

export const applyJobPatch = (job: CronJob, patch: CronJobPatch, nowMs: number) => {
  if (patch.name !== undefined) {
    job.name = normalizeRequiredName(patch.name);
  }
  if (patch.details !== undefined) {
    job.details = patch.details?.trim() || undefined;
  }
  if (patch.description !== undefined) {
    job.description = normalizeOptionalDescription(patch.description);
  }
  if (patch.enabled !== undefined) {
    job.enabled = patch.enabled;
  }
  if (patch.deleteAfterRun !== undefined) {
    job.deleteAfterRun = patch.deleteAfterRun;
  }
  if (patch.schedule) {
    job.schedule = patch.schedule;
  }
  if (patch.payload) {
    job.payload = normalizePayload({ ...job.payload, ...patch.payload });
  }
  if (patch.state) {
    job.state = { ...job.state, ...patch.state };
  }

  job.updatedAtMs = nowMs;
  job.state.nextRunAtMs = computeJobNextRunAtMs(job, nowMs);
  if (!job.enabled) {
    job.state.nextRunAtMs = undefined;
    job.state.runningAtMs = undefined;
  }
};

export const recomputeNextRuns = (state: CronServiceState) => {
  if (!state.store) {
    return;
  }
  const now = state.deps.nowMs();
  for (const job of state.store.jobs) {
    if (!job.state) {
      job.state = {};
    }
    if (!job.enabled) {
      job.state.nextRunAtMs = undefined;
      job.state.runningAtMs = undefined;
      continue;
    }
    job.state.nextRunAtMs = computeJobNextRunAtMs(job, now);
  }
};

export const nextWakeAtMs = (state: CronServiceState): number | undefined => {
  const jobs = state.store?.jobs ?? [];
  const candidates = jobs.filter((job) => job.enabled && typeof job.state.nextRunAtMs === "number");
  if (candidates.length === 0) {
    return undefined;
  }
  const nextWake = candidates.reduce((min, job) => Math.min(min, job.state.nextRunAtMs as number), candidates[0].state.nextRunAtMs as number);
  return nextWake;
};

export const findJobOrThrow = (state: CronServiceState, id: string) => {
  const job = state.store?.jobs.find((j) => j.id === id);
  if (!job) {
    throw new Error(`unknown cron job id: ${id}`);
  }
  return job;
};

export const findJobByName = (state: CronServiceState, name: string) => {
  return state.store?.jobs.find((j) => j.name === name);
};

export const ensureUniqueJobName = (state: CronServiceState, baseName: string): string => {
  if (!findJobByName(state, baseName)) {
    return baseName; // Name is already unique
  }

  // If the name exists, try appending a number until we find a unique one
  let counter = 1;
  let candidateName = `${baseName}-${counter}`;

  while (findJobByName(state, candidateName)) {
    counter++;
    candidateName = `${baseName}-${counter}`;
  }

  return candidateName;
};

export const isJobDue = (job: CronJob, nowMs: number, opts: { forced: boolean }) => {
  if (opts.forced) {
    return true;
  }
  return job.enabled && typeof job.state.nextRunAtMs === "number" && nowMs >= job.state.nextRunAtMs;
};
