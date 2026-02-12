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

// Add connection heartbeat to keep connection alive during long idle periods
let connectionHeartbeat: NodeJS.Timeout | null = null;
let lastSuccessfulCommunication = Date.now();

const setupConnectionHeartbeat = (socketModeClient: SocketModeClient) => {
  // Clear any existing heartbeat
  if (connectionHeartbeat) {
    clearInterval(connectionHeartbeat);
  }

  // Set up a periodic heartbeat to maintain connection during long idle periods
  connectionHeartbeat = setInterval(() => {
    try {
      const currentState = (socketModeClient as any).stateMachine?.getCurrentState?.();
      if (currentState === "ready") {
        // Track the time of last successful communication
        const timeSinceLastCommunication = Date.now() - lastSuccessfulCommunication;

        // If we haven't had communication in a while, try to send a light ping
        if (timeSinceLastCommunication > 60000) { // More than 1 minute
          logger.debug({ timeSinceLastCommunication }, "Connection inactive, checking connectivity");

          // Attempt to ping the WebSocket directly if possible
          const ws = (socketModeClient as any)?.webSocket;
          if (ws && ws.readyState === ws.OPEN) {
            ws.ping?.();
            logger.debug("Sent ping to maintain connection");
          }
        } else {
          logger.trace("Connection is active, no ping needed");
        }
      }
    } catch (error) {
      logger.warn({ error }, "Error during connection heartbeat");
    }
  }, 30000); // Check every 30 seconds

  // Clean up on exit
  process.once('SIGINT', () => {
    if (connectionHeartbeat) {
      clearInterval(connectionHeartbeat);
      connectionHeartbeat = null;
    }
  });

  process.once('SIGTERM', () => {
    if (connectionHeartbeat) {
      clearInterval(connectionHeartbeat);
      connectionHeartbeat = null;
    }
  });
};

// Function to update the last communication time
const updateLastCommunication = () => {
  lastSuccessfulCommunication = Date.now();
};

const getBoltSocketModeClient = (app: SlackApp): SocketModeClient | undefined => {
  return (app as any)?.receiver?.client as SocketModeClient | undefined;
};

const patchUnhandledSocketModeDisconnect = (socketModeClient: SocketModeClient): void => {
  const stateMachine = (socketModeClient as any)?.stateMachine;
  if (!stateMachine || typeof stateMachine.handleUnhandledEvent !== "function") {
    logger.warn("Socket Mode state machine not available for patching");
    return;
  }

  if (stateMachine.__ironbotUnhandledDisconnectPatched) {
    return;
  }

  const originalHandleUnhandledEvent = stateMachine.handleUnhandledEvent;
  stateMachine.handleUnhandledEvent = function patchedHandleUnhandledEvent(event: string, eventPayload: unknown) {
    if (event === "server explicit disconnect" && this.currentState === "connecting") {
      logger.warn("Ignoring server explicit disconnect while connecting; forcing reconnect");
      try {
        this.handle("websocket close", eventPayload);
      } catch (error) {
        logger.warn({ error }, "Failed to force reconnect after explicit disconnect; ignoring event");
      }
      return;
    }
    return originalHandleUnhandledEvent.call(this, event, eventPayload);
  };
  stateMachine.__ironbotUnhandledDisconnectPatched = true;
  logger.info("Patched Socket Mode unhandled disconnect behavior");
};

const attachSocketModeMonitoring = (socketModeClient: SocketModeClient): void => {
  socketModeClient.on("web_client_connected", () => {
    logger.info("Socket Mode web client connected");
    setupConnectionHeartbeat(socketModeClient);
  });

  socketModeClient.on("web_client_disconnected", () => {
    logger.info("Socket Mode web client disconnected");
    if (connectionHeartbeat) {
      clearInterval(connectionHeartbeat);
      connectionHeartbeat = null;
    }
  });

  socketModeClient.on("authenticated", (info) => {
    logger.info({ info }, "Socket Mode authentication successful");
  });

  socketModeClient.on("unable_to_socket_mode_auth", (err) => {
    logger.error({ error: err }, "Unable to authenticate in Socket Mode");
  });
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

  // Log environment variables for debugging service deployment
  const envVars = {
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN ? '***SET***' : 'NOT SET',
    SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN ? '***SET***' : 'NOT SET',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '***SET***' : 'NOT SET',
    NODE_ENV: process.env.NODE_ENV || 'not set',
    TEMP: process.env.TEMP || 'not set',
    USERPROFILE: process.env.USERPROFILE || 'not set',
    USERNAME: process.env.USERNAME || 'not set',
    COMPUTERNAME: process.env.COMPUTERNAME || 'not set'
  };
  logger.debug({ envVars }, "Environment variables available to process");
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

  const app = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,  // Still pass appToken as it's required for Socket Mode
    socketMode: true,
    logLevel: toSlackLogLevel(config.logLevel)
  });

  const boltSocketModeClient = getBoltSocketModeClient(app);
  if (boltSocketModeClient) {
    patchUnhandledSocketModeDisconnect(boltSocketModeClient);
    attachSocketModeMonitoring(boltSocketModeClient);
  } else {
    logger.warn("Bolt Socket Mode client not found; connection monitoring disabled");
  }

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
    idleThresholdMs: 120000,     // 120 seconds (increased from 60s to reduce unnecessary activity probes)
    cooldownWindowMs: 180000,    // 180 seconds (increased from 120s to reduce API pressure during reconnects)
    maxCooldownExpiryMs: 600000, // 10 minutes max (increased from 5 minutes)
    onActivityCallback: updateLastCommunication // Pass the communication update function
  });
  const router = new MessageRouter(
    claude,
    app.client as unknown as { chat: { postMessage: any; update: any } },
    config,
    slackSupervisor
  );
  const handler = new SlackMessageHandler(app, router);
  handler.registerHandlers();

  const sendCronMessage = async (payload: CronMessagePayload): Promise<void> => {
    logger.debug({ channel: payload.channel, textLength: payload.text.length, threadTs: payload.threadTs }, "cron: sending message to Slack");
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
      logger.debug({ channel: payload.channel }, "cron: message sent successfully to Slack");
      // Don't return anything, just void
    }
    const cooldownUntil = (probe as any).cooldownUntil
      ? new Date((probe as any).cooldownUntil).toISOString()
      : "unknown";
    logger.warn({ cooldownUntil }, "cron: Slack probe cooling down, message not sent");
    throw new Error(`Slack probe is cooling down until ${cooldownUntil}`);
  };

  const cronService = new CronService({
    log: logger.child({ subsystem: "cron" }),
    storePath: config.cron.storePath,
    cronEnabled: config.cron.enabled,
    sendMessage: sendCronMessage,
    executeTool: async (toolName: string, params: Record<string, unknown>) => {
      logger.info({ toolName, params }, "cron: executing tool directly");

      // Execute the tool using the ClaudeProcessor's executeTool method
      logger.debug({ toolName }, "cron: starting tool execution");
      const result = await claude.executeTool(toolName, params);
      logger.debug({ toolName, resultLength: result ? String(result).length : 0 }, "cron: tool execution completed");
      return result;
    }
  });

  const healthOk = await performHealthChecks(app, claude, config.skipHealthChecks, slackSupervisor);
  if (!healthOk) {
    logger.warn("Continuing despite health check failures...");
  }

  const launchTimestamp = Date.now();
  logger.info("Launching Slack Bolt app (Socket Mode)...");
  logger.info({ cwd: process.cwd(), execDir: __dirname }, "Bot launch directories");
  await app.start();
  try {
    logger.info("Starting cron service...");
    await cronService.start();
    logger.info("Cron service started successfully");
  } catch (error) {
    logger.error({ error }, "cron: failed to start");
  }
  logger.info({ durationMs: Date.now() - launchTimestamp }, "Slack Bolt app started with Socket Mode");

  // Handle graceful shutdown
  const gracefulShutdown = async () => {
    logger.info("Received shutdown signal, cleaning up...");

    // Clear connection heartbeat
    if (connectionHeartbeat) {
      clearInterval(connectionHeartbeat);
      connectionHeartbeat = null;
    }

    try {
      logger.info("Stopping cron service...");
      await cronService.stop();
      logger.info("Cron service stopped successfully");
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
