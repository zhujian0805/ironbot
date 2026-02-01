import { logger } from "../utils/logging.ts";
import { ClaudeProcessor } from "./claude_processor.ts";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { resolveConfig, type AppConfig } from "../config.ts";
import { deriveSlackSessionKey } from "../sessions/session_key.ts";
import { appendTranscriptMessage, loadTranscriptHistory, resolveSessionTranscript } from "../sessions/transcript.ts";
import { updateLastRoute } from "../sessions/store.ts";

type SlackClientLike = {
  chat: {
    postMessage: (args: { channel: string; text: string; thread_ts?: string; reply_broadcast?: boolean }) => Promise<{ ts?: string }>;
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
      logger.info({ channel, threadTs }, "Response sent to user");
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
    // Ensure we have a ts value. If missing (can happen in DM events), generate one
    const messageTs = event.ts ?? `${Date.now() / 1000}`;
    // Use user's message as thread root. For existing threads, use thread_ts; for root messages, use ts
    const threadTs = event.thread_ts ?? messageTs;
    const responsePrefix = "↪️ ";

    logger.debug(
      {
        channel,
        eventTs: event.ts,
        eventThreadTs: event.thread_ts,
        computedMessageTs: messageTs,
        threadTs,
        isDm: channel.startsWith("D"),
        tsWasGenerated: !event.ts
      },
      "Message event received"
    );

    const { sessionKey } = deriveSlackSessionKey({
      channel,
      threadTs: event.thread_ts,
      ts: event.ts,
      mainKey: this.config.sessions.dmSessionKey
    });

    let conversationHistory = [] as MessageParam[];
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
      logger.info({ channel, threadTs }, "Response sent to user");
    } catch (error) {
      logger.warn({ error }, "Failed to load session transcript history");
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
        sessionKey
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

      const responseText = `${responsePrefix}${response}`;
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
            reply_broadcast: false
          });
        } else {
          logger.warn({ channel }, "No threadTs available, posting to channel root");
          await this.slackClient.chat.postMessage({ channel, text: responseText });
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
      const errorText = `${responsePrefix}:x: ${errorMessage}`;
      if (this.slackClient && channel) {
        if (threadTs) {
          await this.slackClient.chat.postMessage({
            channel,
            text: errorText,
            thread_ts: threadTs,
            reply_broadcast: false
          });
        } else {
          await this.slackClient.chat.postMessage({ channel, text: errorText });
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
}
