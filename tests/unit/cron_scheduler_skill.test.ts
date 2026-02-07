import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseSchedule } from "../../skills/cron-scheduler/cron-scheduler.ts";

process.env.TZ = "UTC";

describe("cron-scheduler parsing helpers", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-06T12:00:00Z"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("parses an 'at' schedule into an ISO timestamp", () => {
    const parsed = parseSchedule("Please send a reminder at 4:29 PM today");
    expect(parsed?.kind).toBe("at");
    expect(parsed?.value).toBe("2026-02-06T16:29:00.000Z");
  });

  it("parses an interval schedule expressed in natural language", () => {
    const parsed = parseSchedule("Run every 10 minutes to keep the team posted");
    expect(parsed?.kind).toBe("every");
    expect(parsed?.value).toBe("10m");
  });

  it("recognizes cron expressions", () => {
    const parsed = parseSchedule("Who's on call? cron 0 29 16 * * *");
    expect(parsed?.kind).toBe("cron");
    expect(parsed?.value.split(" ").length).toBe(5);
  });
});
