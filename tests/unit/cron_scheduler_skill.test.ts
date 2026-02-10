import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildCronAddArgs,
  buildSlackMetadata,
  parseSchedule,
  resolveChannelFromInput
} from "../../skills/cron-scheduler/cron-scheduler.ts";

process.env.TZ = "UTC";

describe("cron-scheduler parsing helpers", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-06T12:00:00Z"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("returns null for natural-language schedules", () => {
    const parsed = parseSchedule("Please send a reminder at 4:29 PM today");
    expect(parsed).toBeNull();
  });

  it("returns null for interval schedules", () => {
    const parsed = parseSchedule("Run every 10 minutes to keep the team posted");
    expect(parsed).toBeNull();
  });

  it("recognizes cron expressions", () => {
    const parsed = parseSchedule("Who's on call? cron 0 29 16 * * *");
    expect(parsed?.kind).toBe("cron");
    expect(parsed?.value.split(" ").length).toBe(5);
  });
});

describe("cron-scheduler helper utilities", () => {
  it("uses Slack channel context when the message lacks an explicit ID", () => {
    const resolved = resolveChannelFromInput("Remind me tomorrow", { channel: "C12345678" });
    expect(resolved).toBe("C12345678");
  });

  it("includes Slack metadata when building cron arguments", () => {
    const extras = {
      threadTs: "1670000000.000200",
      description: "Scheduled from Slack",
      details: "Original request stored"
    };
    const args = buildCronAddArgs(
      "standup",
      "C12345678",
      "Standup check-in",
      { kind: "cron", value: "0 16 * * *" },
      extras
    );
    expect(args).toContain("--thread-ts");
    expect(args).toContain("1670000000.000200");
    expect(args).toContain("--description");
    expect(args).toContain("Scheduled from Slack");
    expect(args).toContain("--details");
    expect(args).toContain("Original request stored");
  });

  it("builds metadata that references the Slack user and location", () => {
    const metadata = buildSlackMetadata({ userId: "U12345", channel: "C12345", threadTs: "1700000000.000300" }, "text");
    expect(metadata.scheduledBy).toBe("<@U12345>");
    expect(metadata.threadTs).toBe("1700000000.000300");
    expect(metadata.description).toContain("<#C12345>");
  });

  it("honors an explicit cron store override when building args", () => {
    const customStore = "/tmp/custom/jobs.json";
    const args = buildCronAddArgs(
      "standup",
      "C12345678",
      "Standup check-in",
      { kind: "cron", value: "0 16 * * *" },
      undefined,
      undefined,
      customStore
    );
    expect(args[3]).toBe("--store");
    expect(args[4]).toBe(customStore);
    expect(args[5]).toBe("add");
  });
});
