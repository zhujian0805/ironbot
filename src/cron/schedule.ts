import { Cron } from "croner";
import type { CronSchedule } from "./types.ts";

export function computeNextRunAtMs(schedule: CronSchedule, nowMs: number): number | undefined {
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
