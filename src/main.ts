import bolt from "@slack/bolt";
import type { App as SlackApp, LogLevel as SlackLogLevel } from "@slack/bolt";
import { resolveConfig } from "./config.js";
import { setupLogging, logger } from "./utils/logging.js";
import { initPermissionManager } from "./services/permission_manager.js";
import { SlackMessageHandler } from "./services/slack_handler.js";
import { ClaudeProcessor } from "./services/claude_processor.js";
import { MessageRouter } from "./services/message_router.js";
import { MemoryManager } from "./memory/manager.js";
import { parseCliArgs } from "./cli/args.js";

const { App, LogLevel } = bolt as typeof import("@slack/bolt");

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

  if (!config.slackBotToken || !config.slackAppToken || !config.slackSigningSecret) {
    logger.error("Slack tokens/signing secret not configured");
  }

  logger.info("Starting Slack AI Agent");

  const permissionManager = initPermissionManager(config.permissionsFile);
  const capabilities = permissionManager.listAllowedCapabilities();
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

  const app = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,
    signingSecret: config.slackSigningSecret ?? "",
    socketMode: true,
    logLevel: toSlackLogLevel(config.logLevel)
  });

  const memoryManager = new MemoryManager(config);
  memoryManager.logStatus();

  const claude = new ClaudeProcessor(config.skillsDir, memoryManager);
  const router = new MessageRouter(claude, app.client as unknown as { chat: { postMessage: any; update: any } }, config);
  const handler = new SlackMessageHandler(app, router);
  handler.registerHandlers();

  const healthOk = await performHealthChecks(app, claude, config.skipHealthChecks);
  if (!healthOk) {
    logger.warn("Continuing despite health check failures...");
  }

  await app.start();
  logger.info("Slack Bolt app started with Socket Mode");
};

main().catch((error) => {
  logger.error({ error }, "Fatal error during startup");
  process.exitCode = 1;
});
