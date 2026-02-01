import { describe, expect, it, vi } from "vitest";

const setupMain = async (configOverrides: Partial<Record<string, unknown>> = {}) => {
  vi.resetModules();

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  };

  const setupLogging = vi.fn();

  const authTest = vi.fn().mockResolvedValue({});
  const appStart = vi.fn().mockResolvedValue(undefined);
  const appConstructor = vi.fn().mockImplementation(() => ({
    client: { auth: { test: authTest }, chat: { postMessage: vi.fn(), update: vi.fn() } },
    start: appStart
  }));

  const permissionManager = {
    listAllowedCapabilities: vi.fn().mockReturnValue({ tools: [], skills: [], mcps: [] }),
    startFileWatcher: vi.fn().mockReturnValue(true)
  };

  const initPermissionManager = vi.fn().mockReturnValue(permissionManager);

  const claudeInstance = {
    checkConnection: vi.fn().mockResolvedValue(true)
  };
  const ClaudeProcessor = vi.fn().mockImplementation(() => claudeInstance);

  const MessageRouter = vi.fn().mockImplementation(() => ({}));

  const memoryManagerInstance = { logStatus: vi.fn() };
  const MemoryManager = vi.fn().mockImplementation(() => memoryManagerInstance);

  const registerHandlers = vi.fn();
  const SlackMessageHandler = vi.fn().mockImplementation(() => ({ registerHandlers }));

  const parseCliArgs = vi.fn().mockReturnValue({});

  const resolveConfig = vi.fn().mockReturnValue({
    slackBotToken: "x",
    slackAppToken: "y",
    slackSigningSecret: "z",
    anthropicBaseUrl: undefined,
    anthropicAuthToken: "token",
    anthropicModel: "model",
    skillsDir: "./skills",
    permissionsFile: "./permissions.yaml",
    debug: false,
    logLevel: "INFO",
    logFile: undefined,
    devMode: false,
    skipHealthChecks: false,
    ...configOverrides
  });

  vi.doMock("@slack/bolt", () => ({
    default: {
      App: appConstructor,
      LogLevel: { DEBUG: "DEBUG", WARN: "WARN", ERROR: "ERROR", INFO: "INFO" }
    }
  }));
  vi.doMock("../../src/cli/args.ts", () => ({ parseCliArgs }));
  vi.doMock("../../src/config.ts", () => ({ resolveConfig }));
  vi.doMock("../../src/utils/logging.ts", () => ({ setupLogging, logger }));
  vi.doMock("../../src/services/permission_manager.ts", () => ({ initPermissionManager }));
  vi.doMock("../../src/services/claude_processor.ts", () => ({ ClaudeProcessor }));
  vi.doMock("../../src/services/message_router.ts", () => ({ MessageRouter }));
  vi.doMock("../../src/services/slack_handler.ts", () => ({ SlackMessageHandler }));
  vi.doMock("../../src/memory/manager.ts", () => ({ MemoryManager }));

  await import("../../src/main.ts");
  await new Promise((resolve) => setImmediate(resolve));

  return {
    appConstructor,
    appStart,
    authTest,
    claudeInstance,
    initPermissionManager,
    permissionManager,
    registerHandlers,
    logger,
    setupLogging
  };
};

describe("main entrypoint", () => {
  it("initializes permissions and starts the watcher", async () => {
    const { initPermissionManager, permissionManager, setupLogging } = await setupMain();

    expect(setupLogging).toHaveBeenCalled();
    expect(initPermissionManager).toHaveBeenCalledWith("./permissions.yaml");
    expect(permissionManager.startFileWatcher).toHaveBeenCalled();
  });

  it("skips health checks when configured", async () => {
    const { authTest, claudeInstance } = await setupMain({ skipHealthChecks: true });

    expect(authTest).not.toHaveBeenCalled();
    expect(claudeInstance.checkConnection).not.toHaveBeenCalled();
  });

  it("logs when Slack tokens are missing", async () => {
    const { logger } = await setupMain({
      slackBotToken: undefined,
      slackAppToken: undefined,
      slackSigningSecret: undefined
    });

    expect(logger.error).toHaveBeenCalledWith("Slack tokens/signing secret not configured");
  });
});
