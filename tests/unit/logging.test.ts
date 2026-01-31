import { afterEach, describe, expect, it, vi } from "vitest";

const { destinationMock, pinoMock } = vi.hoisted(() => {
  const destinationMock = vi.fn((options: { dest: string; sync: boolean }) => ({ options }));
  const pinoMock = vi.fn((options: { level: string }, destination?: unknown) => ({
    level: options.level,
    destination
  }));

  pinoMock.destination = destinationMock;
  pinoMock.stdTimeFunctions = { isoTime: () => "time" };

  return { destinationMock, pinoMock };
});

vi.mock("pino", () => ({
  default: pinoMock
}));

import { setupLogging, logger } from "../../src/utils/logging.js";

afterEach(() => {
  destinationMock.mockClear();
  pinoMock.mockClear();
});

describe("logging", () => {
  it("prefers explicit log level over debug flag", () => {
    const result = setupLogging({ debug: true, logLevel: "ERROR" });

    expect(result.level).toBe("error");
    expect(logger.level).toBe("error");
  });

  it("uses debug level when debug is true and no logLevel provided", () => {
    const result = setupLogging({ debug: true });

    expect(result.level).toBe("debug");
  });

  it("creates a destination when logFile is provided", () => {
    setupLogging({ logFile: "app.log" });

    expect(destinationMock).toHaveBeenCalledWith({ dest: "app.log", sync: false });
  });
});
