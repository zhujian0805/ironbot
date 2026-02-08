import { Cron } from "croner";
import type { CronSchedule } from "./types.ts";
import { parseAbsoluteTimeMs } from "./parse.ts";

export function computeNextRunAtMs(schedule: CronSchedule, nowMs: number): number | undefined {
  if (schedule.kind === "at") {
    const atMs = parseAbsoluteTimeMs(schedule.at);
    if (atMs === null) {
      console.error(`Invalid 'at' schedule time: ${schedule.at}`);
      return undefined;
    }
    const result = atMs > nowMs ? atMs : undefined;
    console.log(`Computed next run for 'at' schedule ${schedule.at}: ${result ? new Date(result).toISOString() : 'none'}`);
    return result;
  }

  if (schedule.kind === "every") {
    const everyMs = Math.max(1, Math.floor(schedule.everyMs));
    const anchor = Math.max(0, Math.floor(schedule.anchorMs ?? nowMs));
    if (nowMs < anchor) {
      console.log(`Computed next run for 'every' schedule: ${new Date(anchor).toISOString()} (before anchor)`);
      return anchor;
    }
    const elapsed = nowMs - anchor;
    const steps = Math.max(1, Math.floor((elapsed + everyMs - 1) / everyMs));
    const result = anchor + steps * everyMs;
    console.log(`Computed next run for 'every' schedule: ${new Date(result).toISOString()}`);
    return result;
  }

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
  console.log(`Computed next run for cron schedule '${expr}'${schedule.tz ? ` @ ${schedule.tz}` : ''}: ${result ? new Date(result).toISOString() : 'none'}`);
  return result;
}
