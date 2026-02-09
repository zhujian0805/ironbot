import { App, LogLevel } from "@slack/bolt";
import type { App as SlackApp, LogLevel as SlackLogLevel } from "@slack/bolt";
import { resolveConfig } from "./config.ts";
import { setupLogging, logger } from "./utils/logging.ts";
import { CronService } from "./cron/service.ts";
import { formatForSlack } from "./utils/slack_formatter.ts";
import { initPermissionManager } from "./services/permission_manager.ts";
import { SlackMessageHandler } from "./services/slack_handler.ts";
import { ClaudeProcessor } from "./services/claude_processor.ts";
import { MessageRouter } from "./services/message_router.ts";
import { MemoryManager } from "./memory/manager.ts";
import { parseCliArgs } from "./cli/args.ts";
import { RateLimiter, type ApiMethod } from "./services/rate_limiter.ts";
import { RetryManager } from "./services/retry_manager.ts";
import { SlackApiOptimizer } from "./services/slack_api_optimizer.ts";
import { SlackConnectionSupervisor } from "./services/slack_connection_supervisor.ts";
import type { CronMessagePayload } from "./cron/types.ts";
import { SocketModeClient } from "@slack/socket-mode";

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

const checkSlackConnection = async (app: SlackApp, supervisor: SlackConnectionSupervisor): Promise<boolean> => {
  try {
    const probeResult = await supervisor.runProbe(
      "general",
      () => app.client.auth.test(),
      "Slack health check"
    );

    if (probeResult.status === "executed") {
      supervisor.recordActivity();
    }

    return true;
  } catch (error) {
    logger.error({ error }, "Slack connection check failed");
    return false;
  }
};

const patchSocketModeDisconnectDuringConnect = (() => {
  let applied = false;
  return () => {
    if (applied) {
      return;
    }
    applied = true;
    const original = SocketModeClient.prototype.onWebSocketMessage;
    SocketModeClient.prototype.onWebSocketMessage = async function (payload) {
      try {
        const currentState = this.stateMachine?.getCurrentState?.();
        if (currentState === "connecting") {
          const parsed = JSON.parse(String(payload.data));
          if (parsed?.type === "disconnect") {
            this.logger.debug("Ignoring server explicit disconnect while still connecting");
            return;
          }
        }
      } catch {
        // ignore parsing errors and fall back to the original handler
      }
      return original.call(this, payload);
    };

    // Additionally patch the disconnect handling to add delays
    const originalHandleDisconnect = SocketModeClient.prototype.handleDisconnect;
    SocketModeClient.prototype.handleDisconnect = async function () {
      try {
        // Log the disconnection and add a small delay to prevent rapid reconnects
        this.logger.debug("Handling disconnection, preparing for reconnect...");
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay before attempting to reconnect
        return originalHandleDisconnect.apply(this, arguments);
      } catch (error) {
        this.logger.error({ error }, "Error in handleDisconnect patch");
        return originalHandleDisconnect.apply(this, arguments);
      }
    };
  };
})();

patchSocketModeDisconnectDuringConnect();


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
  skipChecks: boolean,
  supervisor: SlackConnectionSupervisor
): Promise<boolean> => {
  if (skipChecks) {
    logger.info("Skipping health checks as requested");
    return true;
  }

  logger.info("Performing startup health checks...");
  const slackOk = await checkSlackConnection(app, supervisor);
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
    logger.error("Missing SLACK_BOT_TOKEN" + (!config.slackBotToken ? ": undefined" : ": defined"));
    logger.error("Missing SLACK_APP_TOKEN" + (!config.slackAppToken ? ": undefined" : ": defined"));
    process.exit(1); // Exit if tokens are not configured
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

  // Create a custom SocketModeClient with additional patches
  const socketModeClient = new SocketModeClient({
    appToken: config.slackAppToken!,
    logLevel: toSlackLogLevel(config.logLevel),
    logger: undefined, // Use default logger
    // Increase ping timeout to avoid premature disconnections
    pingTimeoutMilliseconds: 30000, // 30 seconds instead of default
    // Add event handlers to better monitor connection state
    clientPingTimeoutMilliseconds: 30000, // 30 seconds
  });

  const app = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,  // Still pass appToken as it's required for Socket Mode
    socketMode: true,
    // Use our custom socket mode client
    socketModeClient: socketModeClient,
    logLevel: toSlackLogLevel(config.logLevel),
    retryConfig: {
      retries: config.slackRetry.maxAttempts,
      factor: 2, // backoff multiplier
      minTimeout: config.slackRetry.baseDelayMs,
      maxTimeout: config.slackRetry.maxDelayMs
    }
  });

  // Add event listeners to monitor connection state
  socketModeClient.on("web_client_connected", () => {
    logger.info("Socket Mode web client connected");
  });

  socketModeClient.on("web_client_disconnected", () => {
    logger.info("Socket Mode web client disconnected");
  });

  socketModeClient.on("authenticated", (info) => {
    logger.info({ info }, "Socket Mode authentication successful");
  });

  // Add more conservative retry configuration for connection
  socketModeClient.on("unable_to_socket_mode_auth", (err) => {
    logger.error({ error: err }, "Unable to authenticate in Socket Mode");
  });

  const memoryManager = new MemoryManager(config);
  memoryManager.logStatus();

  logger.info({ skillsDir: config.skillsDir }, "[INIT] Creating ClaudeProcessor");
  logger.debug({ skillDirs: config.skillDirs }, "Skill directories being loaded");
  logger.debug({ memoryWorkspace: config.memory.workspaceDir, memorySearchEnabled: config.memorySearch.enabled }, "Memory manager state");
  const claude = new ClaudeProcessor(config.skillDirs, memoryManager);
  const slackOptimizer = new SlackApiOptimizer();
  const slackRateLimiter = new RateLimiter({
    enabled: config.slackRateLimit.enabled,
    requestsPerSecond: config.slackRateLimit.requestsPerSecond,
    burstCapacity: config.slackRateLimit.burstCapacity,
    queueSize: config.slackRateLimit.queueSize,
    retryMaxAttempts: config.slackRetry.maxAttempts,
    retryBaseDelayMs: config.slackRetry.baseDelayMs,
    retryMaxDelayMs: config.slackRetry.maxDelayMs
  });
  const slackRetryManager = new RetryManager(config.retry);
  const slackSupervisor = new SlackConnectionSupervisor(slackOptimizer, slackRateLimiter, slackRetryManager, {
    idleThresholdMs: 60000,      // 60 seconds (increased from 30s to reduce unnecessary activity probes)
    cooldownWindowMs: 120000,    // 120 seconds (increased from 60s to reduce API pressure)
    maxCooldownExpiryMs: 300000  // 5 minutes max
  });
  const router = new MessageRouter(
    claude,
    app.client as unknown as { chat: { postMessage: any; update: any } },
    config,
    slackSupervisor
  );
  const handler = new SlackMessageHandler(app, router);
  handler.registerHandlers();

  const sendCronMessage = async (payload: CronMessagePayload) => {
    const formatted = formatForSlack(payload.text);
    const postPayload = {
      channel: payload.channel,
      text: formatted,
      mrkdwn: true,
      thread_ts: payload.threadTs,
      reply_broadcast: payload.replyBroadcast ?? false,
    };
    const method: ApiMethod = "postMessage";
    const probe = await slackSupervisor.runProbe(
      method,
      () => app.client.chat.postMessage(postPayload),
      "cron job notification"
    );
    if (probe.status === "executed") {
      slackSupervisor.recordActivity();
      return probe.value;
    }
    const cooldownUntil = probe.cooldownUntil
      ? new Date(probe.cooldownUntil).toISOString()
      : "unknown";
    throw new Error(`Slack probe is cooling down until ${cooldownUntil}`);
  };

  const cronService = new CronService({
    log: logger.child({ subsystem: "cron" }),
    storePath: config.cron.storePath,
    cronEnabled: config.cron.enabled,
    sendMessage: sendCronMessage,
    executeTool: async (toolName: string, params: Record<string, unknown>) => {
      logger.info({ toolName, params }, "cron: executing tool directly");

      // Execute the tool using the ToolExecutor's executeTool method
      return await claude.toolExecutor.executeTool(toolName, params);
    }
  });

  const healthOk = await performHealthChecks(app, claude, config.skipHealthChecks, slackSupervisor);
  if (!healthOk) {
    logger.warn("Continuing despite health check failures...");
  }

  const launchTimestamp = Date.now();
  logger.info("Launching Slack Bolt app (Socket Mode)...");
  await app.start();
  try {
    await cronService.start();
  } catch (error) {
    logger.error({ error }, "cron: failed to start");
  }
  logger.info({ durationMs: Date.now() - launchTimestamp }, "Slack Bolt app started with Socket Mode");

  // Handle graceful shutdown
  const gracefulShutdown = async () => {
    logger.info("Received shutdown signal, cleaning up...");

    try {
      await cronService.stop();
      logger.info("Cron service stopped");
    } catch (error) {
      logger.error({ error }, "Error stopping cron service");
    }

    try {
      slackOptimizer.shutdown();
      logger.info("Slack API optimizer shut down");
    } catch (error) {
      logger.error({ error }, "Error shutting down Slack API optimizer");
    }

    try {
      await app.stop();
      logger.info("Slack app stopped");
    } catch (error) {
      logger.error({ error }, "Error stopping Slack app");
    }

    process.exit(0);
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
};

main().catch((error) => {
  const errorDetails =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: JSON.stringify(error) };
  logger.error({ error: errorDetails }, "Fatal error during startup");
  process.exitCode = 1;
});
