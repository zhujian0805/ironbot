import { logger } from "../utils/logging.js";
import { ClaudeProcessor } from "./claude_processor.js";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { resolveConfig, type AppConfig } from "../config.js";
import { deriveSlackSessionKey } from "../sessions/session_key.js";
import { appendTranscriptMessage, loadTranscriptHistory, resolveSessionTranscript } from "../sessions/transcript.js";
import { updateLastRoute } from "../sessions/store.js";

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
    let threadTs = event.thread_ts ?? event.ts;
    const responsePrefix = "↪️ ";
    let thinkingMessageTs: string | undefined;

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
    } catch (error) {
      logger.warn({ error }, "Failed to append user message to transcript");
    }

    try {
      // Post initial thinking indicator to establish thread
      const thinkingTexts = [
        "Putting it all together...",
        "Thinking it through...",
        "Working on that...",
        "Checking a few things...",
        "One moment while I prepare a response...",
        "Let me gather that for you..."
      ];
      const thinkingText = thinkingTexts[Math.floor(Math.random() * thinkingTexts.length)];

      if (this.slackClient && channel) {
        try {
          const thinkingMsg = await this.slackClient.chat.postMessage({
            channel,
            text: thinkingText
          });
          thinkingMessageTs = thinkingMsg.ts;
          // Use thinking message as thread root if not already in a thread
          if (!event.thread_ts && thinkingMessageTs) {
            threadTs = thinkingMessageTs;
          }
        } catch (error) {
          logger.warn({ error }, "Failed to post thinking indicator");
        }
      }

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
      } catch (error) {
        logger.warn({ error }, "Failed to append assistant message to transcript");
      }

      const responseText = `${responsePrefix}Responded in thread.`;
      if (thinkingMessageTs && this.slackClient && channel) {
        // Update thinking message with completion status
        try {
          await this.slackClient.chat.update({
            channel,
            ts: thinkingMessageTs,
            text: responseText
          });
        } catch (error) {
          logger.warn({ error }, "Failed to update thinking message");
        }

        // Post actual response in thread
        await this.slackClient.chat.postMessage({
          channel,
          text: `${responsePrefix}${response}`,
          thread_ts: threadTs,
          reply_broadcast: false
        });
      } else if (this.slackClient && channel) {
        if (threadTs) {
          await this.slackClient.chat.postMessage({
            channel,
            text: `${responsePrefix}${response}`,
            thread_ts: threadTs,
            reply_broadcast: false
          });
        } else {
          await this.slackClient.chat.postMessage({ channel, text: `${responsePrefix}${response}` });
        }
      } else if (threadTs) {
        await say({ text: `${responsePrefix}${response}`, thread_ts: threadTs });
      } else {
        await say(`${responsePrefix}${response}`);
      }
    } catch (error) {
      logger.error({ error }, "Failed to handle message");
      const errorMessage = "Sorry, I encountered an error processing your message.";
      const errorText = `${responsePrefix}:x: ${errorMessage}`;

      if (thinkingMessageTs && this.slackClient && channel) {
        try {
          await this.slackClient.chat.update({
            channel,
            ts: thinkingMessageTs,
            text: errorText
          });
        } catch (error) {
          logger.warn({ error }, "Failed to update thinking message with error" );
        }
      } else if (this.slackClient && channel) {
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
