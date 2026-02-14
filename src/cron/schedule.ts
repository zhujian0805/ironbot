import { Cron } from "croner";
import type { Schedule } from "./types.ts";

export function computeNextRunAtMs(schedule: Schedule, nowMs: number): number | undefined {
  if (schedule.kind === "at") {
    // For "at" schedules, parse the ISO string and return that time (if it's in the future)
    const atMs = new Date(schedule.at).getTime();
    return atMs > nowMs ? atMs : undefined;
  }

  if (schedule.kind === "every") {
    // For "every" schedules, next run is now + interval
    return nowMs + schedule.everyMs;
  }

  if (schedule.kind === "cron") {
    // For cron schedules, use the croner library
    const expr = schedule.expr.trim();
    if (!expr) {
      console.error(`Empty cron expression: ${expr}`);
      return undefined;
    }
    const cron = new Cron(expr, {
      timezone: schedule.tz?.trim() || undefined,
      catch: false,
    });
    const next = cron.nextRun(new Date(nowMs));
    const result = next ? next.getTime() : undefined;
    return result;
  }

  // Should never reach here due to type exhaustiveness
  return undefined;
}
