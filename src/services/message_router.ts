import { logger } from "../utils/logging.ts";
import { formatForSlack } from "../utils/slack_formatter.ts";
import { ClaudeProcessor } from "./claude_processor.ts";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { resolveConfig, type AppConfig } from "../config.ts";
import { deriveSlackSessionKey } from "../sessions/session_key.ts";
import { appendTranscriptMessage, loadTranscriptHistory, resolveSessionTranscript } from "../sessions/transcript.ts";
import { updateLastRoute } from "../sessions/store.ts";
import fs from "node:fs";
import path from "node:path";

type SlackClientLike = {
  chat: {
    postMessage: (args: { channel: string; text: string; thread_ts?: string; reply_broadcast?: boolean; mrkdwn?: boolean }) => Promise<{ ts?: string }>;
    update: (args: { channel: string; ts: string; text: string }) => Promise<unknown>;
  };
  assistant?: {
    threads?: {
      setStatus?: (args: { token?: string; channel_id: string; thread_ts: string; status: string }) => Promise<unknown>;
    };
  };
  apiCall?: (method: string, args: { token?: string; channel_id: string; thread_ts: string; status: string }) => Promise<unknown>;
};

type SlackEvent = {
  text?: string;
  channel?: string;
  bot_id?: string;
  ts?: string;
  thread_ts?: string;
  user?: string;
};

export class MessageRouter {
  private claude: ClaudeProcessor;
  private slackClient?: SlackClientLike;
  private config: AppConfig;
  private newConversationChannels: Set<string> = new Set();
  private crossSessionMemoryChannels: Set<string> = new Set();
  private globalCrossSessionMemory: boolean = false;

  constructor(claude: ClaudeProcessor, slackClient?: SlackClientLike, config: AppConfig = resolveConfig()) {
    this.claude = claude;
    this.slackClient = slackClient;
    this.config = config;
  }

  private async setThreadStatus(params: { channelId: string; threadTs?: string; status: string }): Promise<void> {
    if (!this.slackClient || !params.channelId || !params.threadTs) {
      return;
    }

    const payload = {
      token: this.config.slackBotToken,
      channel_id: params.channelId,
      thread_ts: params.threadTs,
      status: params.status
    };

    try {
      if (this.slackClient.assistant?.threads?.setStatus) {
        await this.slackClient.assistant.threads.setStatus(payload);
        return;
      }

      if (typeof this.slackClient.apiCall === "function") {
        await this.slackClient.apiCall("assistant.threads.setStatus", payload);
      }
      logger.info({ channelId: params.channelId, threadTs: params.threadTs }, "Response sent to user");
    } catch (error) {
      logger.warn({ error, channelId: params.channelId }, "Failed to update Slack thread status");
    }
  }

  async handleAppMention(
    event: SlackEvent,
    say: (message: string | { text: string; thread_ts?: string }) => Promise<void>
  ): Promise<void> {
    await this.handleMessage(event, say);
  }

  async handleMessage(
    event: SlackEvent,
    say: (message: string | { text: string; thread_ts?: string }) => Promise<void>
  ): Promise<void> {
    if (event.bot_id) {
      logger.info({ botId: event.bot_id }, "Skipping bot message");
      return;
    }

    const text = event.text ?? "";
    const channel = event.channel ?? "";
    
    // Check for commands in messages (e.g., "/remember" typed as a message)
    // Handle these BEFORE storing the message in transcript
    if (text.trim().startsWith("/")) {
      const commandParts = text.trim().split(/\s+/);
      const commandName = commandParts[0];
      const commandText = commandParts.slice(1).join(" ");
      
      if (commandName === "/remember") {
        await this.handleRememberCommand({
          command: commandName,
          text: commandText,
          channel_id: channel,
          user_id: event.user || "",
          trigger_id: ""
        }, say);
        return; // Don't store command messages in transcript
      }
      if (commandName === "/clear") {
        await this.handleClearCommand({
          command: commandName,
          text: commandText,
          channel_id: channel,
          user_id: event.user || "",
          trigger_id: ""
        }, say);
        return; // Don't store command messages in transcript
      }
    }
    
    // Ensure we have a ts value. If missing (can happen in DM events), generate one
    // Ensure we have a ts value. If missing (can happen in DM events), generate one
    const messageTs = event.ts ?? `${Date.now() / 1000}`;
    // Use user's message as thread root. For existing threads, use thread_ts; for root messages, use ts
    const threadTs = event.thread_ts ?? messageTs;
    const responsePrefix = "↪️ ";

    // Check if this is a new conversation request
    const userKey = `${channel}:${event.user}`;
    const forceNewSession = this.newConversationChannels.has(userKey);

    if (forceNewSession) {
      this.newConversationChannels.delete(userKey);
      logger.info({ channel, userId: event.user }, "Starting new conversation without history");
    }

    logger.debug(
      {
        channel,
        eventTs: event.ts,
        eventThreadTs: event.thread_ts,
        computedMessageTs: messageTs,
        threadTs,
        isDm: channel.startsWith("D"),
        tsWasGenerated: !event.ts,
        forceNewSession
      },
      "Message event received"
    );

    const { sessionKey } = deriveSlackSessionKey({
      channel,
      threadTs: event.thread_ts,
      ts: event.ts,
      mainKey: this.config.sessions.dmSessionKey,
      forceNewSession
    });

    // Check if cross-session memory is enabled for this channel/thread
    const channelKey = event.thread_ts ? `${channel}:${event.thread_ts}` : `${channel}`;
    const crossSessionMemory = this.globalCrossSessionMemory || this.crossSessionMemoryChannels.has(channelKey);

    let conversationHistory = [] as MessageParam[];
    
    // Only load conversation history for threads or when cross-session memory is enabled
    if (event.thread_ts || crossSessionMemory) {
      try {
        const session = await resolveSessionTranscript({
          storePath: this.config.sessions.storePath,
          sessionKey,
          transcriptsDir: this.config.sessions.transcriptsDir
        });
        conversationHistory = await loadTranscriptHistory({
          sessionFile: session.sessionFile,
          maxMessages: this.config.sessions.maxHistoryMessages
        });
        logger.info({ channel, threadTs }, "Loaded conversation history");
      } catch (error) {
        logger.warn({ error }, "Failed to load session transcript history");
      }
    } else {
      logger.info({ channel, threadTs }, "Starting fresh conversation (no thread, no cross-session memory)");
    }

    try {
      await appendTranscriptMessage({
        storePath: this.config.sessions.storePath,
        sessionKey,
        transcriptsDir: this.config.sessions.transcriptsDir,
        role: "user",
        content: text
      });
      logger.info({ channel, threadTs }, "Response sent to user");
    } catch (error) {
      logger.warn({ error }, "Failed to append user message to transcript");
    }

    try {
      await this.setThreadStatus({ channelId: channel, threadTs, status: "is typing..." });
      
      const response = await this.claude.processMessage(text, {
        conversationHistory,
        sessionKey,
        crossSessionMemory
      });

      try {
        await appendTranscriptMessage({
          storePath: this.config.sessions.storePath,
          sessionKey,
          transcriptsDir: this.config.sessions.transcriptsDir,
          role: "assistant",
          content: response
        });
      logger.info({ channel, threadTs }, "Response sent to user");
      } catch (error) {
        logger.warn({ error }, "Failed to append assistant message to transcript");
      }

      const responseText = formatForSlack(`${responsePrefix}${response}`);
      logger.debug(
        {
          channel,
          threadTs,
          hasSlackClient: !!this.slackClient,
          isDm: channel.startsWith("D")
        },
        "Preparing to post response"
      );

      if (this.slackClient && channel) {
        if (threadTs) {
          logger.debug({ channel, threadTs }, "Posting response to thread via slackClient");
          await this.slackClient.chat.postMessage({
            channel,
            text: responseText,
            thread_ts: threadTs,
            reply_broadcast: false,
            mrkdwn: true
          });
        } else {
          logger.warn({ channel }, "No threadTs available, posting to channel root");
          await this.slackClient.chat.postMessage({ channel, text: responseText, mrkdwn: true });
        }
      } else if (threadTs) {
        logger.debug({ channel, threadTs }, "Posting response to thread via say()");
        await say({ text: responseText, thread_ts: threadTs });
      } else {
        logger.warn({ channel }, "No threadTs available, posting via say() without thread");
        await say(responseText);
      }
    } catch (error) {
      logger.error({ error }, "Failed to handle message");
      const errorMessage = "Sorry, I encountered an error processing your message.";
      const errorText = formatForSlack(`${responsePrefix}:x: ${errorMessage}`);
      if (this.slackClient && channel) {
        if (threadTs) {
          await this.slackClient.chat.postMessage({
            channel,
            text: errorText,
            thread_ts: threadTs,
            reply_broadcast: false,
            mrkdwn: true
          });
        } else {
          await this.slackClient.chat.postMessage({ channel, text: errorText, mrkdwn: true });
        }
      } else if (threadTs) {
        await say({ text: errorText, thread_ts: threadTs });
      } else {
        await say(errorText);
      }
    } finally {
      await this.setThreadStatus({ channelId: channel, threadTs, status: "" });
      try {
        await updateLastRoute({
          storePath: this.config.sessions.storePath,
          sessionKey,
          channel,
          threadId: threadTs,
          userId: event.user,
          messageTs: event.ts
        });
      } catch (error) {
        logger.warn({ error }, "Failed to update session metadata");
      }
    }
  }

  async handleSlashCommand(
    command: { command: string; text: string; channel_id: string; user_id: string; trigger_id: string },
    ack: () => Promise<void>,
    respond: (message: string | { text: string; response_type?: string }) => Promise<void>
  ): Promise<void> {
    await ack();

    if (command.command === "/clear") {
      await this.handleClearCommand(command, respond);
    } else if (command.command === "/remember") {
      await this.handleRememberCommand(command, respond);
    }
  }

  private async handleClearCommand(
    command: { command: string; text: string; channel_id: string; user_id: string; trigger_id: string },
    respondOrSay: (message: string | { text: string; response_type?: string; thread_ts?: string }) => Promise<void>
  ): Promise<void> {
    const channel = command.channel_id;
    const userId = command.user_id;

    logger.info({ channel, userId, command: command.command }, "Handling /clear command");

    // Disable cross-session memory for this channel (make memory per-thread)
    this.crossSessionMemoryChannels.delete(channel);

    // Derive the current session key for the channel (main channel session)
    const { sessionKey } = deriveSlackSessionKey({
      channel,
      mainKey: this.config.sessions.dmSessionKey
    });

    // Get the session entry and transcript file path
    try {
      const { entry, sessionFile } = await resolveSessionTranscript({
        storePath: this.config.sessions.storePath,
        sessionKey,
        transcriptsDir: this.config.sessions.transcriptsDir
      });

      // Delete the transcript file if it exists
      try {
        await fs.promises.access(sessionFile, fs.constants.F_OK);
        await fs.promises.unlink(sessionFile);
        logger.info({ sessionFile }, "Deleted transcript file for cleared session");
      } catch (error) {
        // File doesn't exist or can't be deleted, that's ok
        logger.debug({ sessionFile, error }, "Transcript file not found or could not be deleted");
      }
    } catch (error) {
      logger.warn({ sessionKey, error }, "Failed to resolve or delete session transcript");
    }

    // Clear memory for the session
    try {
      await this.claude.clearMemoryForSession(sessionKey);
    } catch (error) {
      logger.warn({ sessionKey, error }, "Failed to clear memory for session");
    }
    this.newConversationChannels.add(`${channel}:${userId}`);

    // Check if this is a slash command (has response_type support) or regular message
    const isSlashCommand = typeof respondOrSay === 'function' && command.trigger_id;

    if (isSlashCommand) {
      // For slash commands, send ephemeral confirmation
      await (respondOrSay as any)({
        text: "🧹 Clearing conversation history and disabling cross-session memory! Memory is now per-thread.",
        response_type: "ephemeral"
      });
    }

    // Send a public message to acknowledge
    await respondOrSay(`🧹 <@${userId}> has cleared the conversation history and disabled cross-session memory. Memory is now per-thread!`);

    logger.info({ channel, userId }, "Conversation cleared and cross-session memory disabled");
  }

  private async handleRememberCommand(
    command: { command: string; text: string; channel_id: string; user_id: string; trigger_id: string },
    respondOrSay: (message: string | { text: string; response_type?: string; thread_ts?: string }) => Promise<void>
  ): Promise<void> {
    const channel = command.channel_id;
    const userId = command.user_id;
    const threadTs = command.text?.trim(); // Allow specifying a thread_ts

    logger.info({ channel, userId, command: command.command, threadTs }, "Handling /remember command");

    // Enable global cross-session memory
    this.globalCrossSessionMemory = true;

    // Check if this is a slash command (has response_type support) or regular message
    const isSlashCommand = typeof respondOrSay === 'function' && command.trigger_id;

    if (isSlashCommand) {
      // For slash commands, send ephemeral confirmation
      await (respondOrSay as any)({
        text: "🧠 Global cross-session memory enabled! I will now remember all historical conversations across all channels and threads.",
        response_type: "ephemeral"
      });
    }

    // Send a public message to acknowledge
    await respondOrSay(`🧠 <@${userId}> has enabled global cross-session memory. I will now remember all historical conversations across all channels and threads!`);

    logger.info({ channel, userId, threadTs }, "Global cross-session memory enabled");
  }
}
