import { App, LogLevel } from "@slack/bolt";
import type { App as SlackApp, LogLevel as SlackLogLevel } from "@slack/bolt";
import { resolveConfig } from "./config.ts";
import { setupLogging, logger } from "./utils/logging.ts";
import { initPermissionManager } from "./services/permission_manager.ts";
import { SlackMessageHandler } from "./services/slack_handler.ts";
import { ClaudeProcessor } from "./services/claude_processor.ts";
import { MessageRouter } from "./services/message_router.ts";
import { MemoryManager } from "./memory/manager.ts";
import { parseCliArgs } from "./cli/args.ts";

const toSlackLogLevel = (level: string): SlackLogLevel => {
  switch (level.toUpperCase()) {
    case "DEBUG":
      return LogLevel.DEBUG;
    case "WARNING":
      return LogLevel.WARN;
    case "ERROR":
      return LogLevel.ERROR;
    default:
      return LogLevel.INFO;
  }
};

const checkSlackConnection = async (app: SlackApp): Promise<boolean> => {
  try {
    await app.client.auth.test();
    return true;
  } catch (error) {
    logger.error({ error }, "Slack connection check failed");
    return false;
  }
};

const checkLlmConnection = async (claude: ClaudeProcessor): Promise<boolean> => {
  try {
    return await claude.checkConnection();
  } catch (error) {
    logger.error({ error }, "LLM connection check failed");
    return false;
  }
};

const performHealthChecks = async (
  app: SlackApp,
  claude: ClaudeProcessor,
  skipChecks: boolean
): Promise<boolean> => {
  if (skipChecks) {
    logger.info("Skipping health checks as requested");
    return true;
  }

  logger.info("Performing startup health checks...");
  const slackOk = await checkSlackConnection(app);
  const llmOk = await checkLlmConnection(claude);
  if (!slackOk || !llmOk) {
    logger.error("Health checks failed - application may not function correctly");
    return false;
  }
  logger.info("All health checks passed");
  return true;
};

const main = async (): Promise<void> => {
  const args = parseCliArgs();
  const config = resolveConfig(args);

  setupLogging({ debug: config.debug, logLevel: config.logLevel, logFile: config.logFile });
  logger.debug({ cliArgs: args, configPath: config.permissionsFile, skillsDir: config.skillsDir }, "CLI arguments parsed and configuration resolved");

  if (!config.slackBotToken || !config.slackAppToken) {
    logger.error("Slack tokens not configured");
  }

  logger.info(
    {
      slackBotTokenConfigured: Boolean(config.slackBotToken),
      slackAppTokenConfigured: Boolean(config.slackAppToken)
    },
    "Starting Slack AI Agent"
  );
  logger.debug({ skipHealthChecks: config.skipHealthChecks }, "Health check configuration");

  const permissionManager = initPermissionManager(config.permissionsFile);
  const capabilities = permissionManager.listAllowedCapabilities();
  logger.debug({ capabilities }, "Allowed capabilities loaded from permissions config");
  logger.info(
    {
      tools: capabilities.tools,
      toolCount: capabilities.tools.length,
      skills: capabilities.skills.length,
      mcps: capabilities.mcps.length
    },
    "Loaded capabilities"
  );

  if (permissionManager.startFileWatcher()) {
    logger.info("Permission config hot-reload enabled");
  }
  logger.debug({ permissionsFile: config.permissionsFile, permissionsWatcher: true }, "Permission manager ready");

  const app = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,
    socketMode: true,
    logLevel: toSlackLogLevel(config.logLevel),
    retryConfig: {
      retries: config.slackRetry.maxAttempts,
      factor: 2, // backoff multiplier
      minTimeout: config.slackRetry.baseDelayMs,
      maxTimeout: config.slackRetry.maxDelayMs
    }
  });

  const memoryManager = new MemoryManager(config);
  memoryManager.logStatus();

  logger.info({ skillsDir: config.skillsDir }, "[INIT] Creating ClaudeProcessor");
  logger.debug({ memoryWorkspace: config.memory.workspaceDir, memorySearchEnabled: config.memorySearch.enabled }, "Memory manager state");
  const claude = new ClaudeProcessor(config.skillsDir, memoryManager);
  const router = new MessageRouter(claude, app.client as unknown as { chat: { postMessage: any; update: any } }, config);
  const handler = new SlackMessageHandler(app, router);
  handler.registerHandlers();

  const healthOk = await performHealthChecks(app, claude, config.skipHealthChecks);
  if (!healthOk) {
    logger.warn("Continuing despite health check failures...");
  }

  const launchTimestamp = Date.now();
  logger.info("Launching Slack Bolt app (Socket Mode)...");
  await app.start();
  logger.info({ durationMs: Date.now() - launchTimestamp }, "Slack Bolt app started with Socket Mode");
};

main().catch((error) => {
  logger.error({ error }, "Fatal error during startup");
  process.exitCode = 1;
});
