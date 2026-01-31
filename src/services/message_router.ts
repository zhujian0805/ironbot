import { logger } from "../utils/logging.js";
import { ClaudeProcessor } from "./claude_processor.js";

type SlackClientLike = {
  chat: {
    postMessage: (args: { channel: string; text: string }) => Promise<{ ts?: string }>;
    update: (args: { channel: string; ts: string; text: string }) => Promise<unknown>;
  };
};

export class MessageRouter {
  private claude: ClaudeProcessor;
  private slackClient?: SlackClientLike;

  constructor(claude: ClaudeProcessor, slackClient?: SlackClientLike) {
    this.claude = claude;
    this.slackClient = slackClient;
  }

  async handleAppMention(event: { text?: string; channel?: string; bot_id?: string }, say: (message: string) => Promise<void>): Promise<void> {
    await this.handleMessage(event, say);
  }

  async handleMessage(event: { text?: string; channel?: string; bot_id?: string }, say: (message: string) => Promise<void>): Promise<void> {
    if (event.bot_id) {
      logger.info({ botId: event.bot_id }, "Skipping bot message");
      return;
    }

    const text = event.text ?? "";
    const channel = event.channel ?? "";
    let thinkingTs: string | undefined;

    try {
      if (this.slackClient && channel) {
        const thinking = await this.slackClient.chat.postMessage({
          channel,
          text: ":thinking_face: Thinking..."
        });
        thinkingTs = thinking.ts;
      }
    } catch (error) {
      logger.warn({ error }, "Failed to post thinking indicator");
    }

    try {
      const response = await this.claude.processMessage(text);

      if (this.slackClient && thinkingTs && channel) {
        await this.slackClient.chat.update({ channel, ts: thinkingTs, text: response });
      } else {
        await say(response);
      }
    } catch (error) {
      logger.error({ error }, "Failed to handle message");
      const errorMessage = "Sorry, I encountered an error processing your message.";
      if (this.slackClient && thinkingTs && channel) {
        await this.slackClient.chat.update({ channel, ts: thinkingTs, text: `:x: ${errorMessage}` });
      } else {
        await say(errorMessage);
      }
    }
  }
}
