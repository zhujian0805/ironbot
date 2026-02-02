import { logger } from "../utils/logging.ts";

export type SlackAppLike = {
  event: (eventName: string, handler: (args: any) => Promise<void>) => void;
};

export type MessageRouter = {
  handleAppMention: (event: any, say: (message: string | { text: string; thread_ts?: string }) => Promise<void>) => Promise<void>;
  handleMessage?: (event: any, say: (message: string | { text: string; thread_ts?: string }) => Promise<void>) => Promise<void>;
  handleSlashCommand?: (command: any, ack: () => Promise<void>, respond: (message: string | { text: string; response_type?: string }) => Promise<void>) => Promise<void>;
};

export const registerSlackHandlers = (app: SlackAppLike, router: MessageRouter): void => {
  app.event("app_mention", async ({ event, say }) => {
    logger.debug({ eventType: "app_mention" }, "Handling Slack app_mention event");
    await router.handleAppMention(event, say);
  });

  if (router.handleMessage) {
    app.event("message", async ({ event, say }) => {
      const channel = typeof event?.channel === "string" ? event.channel : "";
      if (!channel.startsWith("D")) return;
      if (event?.bot_id) return;
      if (event?.subtype) return;

      logger.debug(
        {
          eventType: "message",
          hasTs: !!event?.ts,
          channel,
          eventKeys: Object.keys(event ?? {})
        },
        "Handling Slack direct message event"
      );
      await router.handleMessage?.(event, say);
    });
  }

  if (router.handleSlashCommand) {
    (app as any).command("/clear", async ({ command, ack, respond }) => {
      logger.debug({ command: command.command }, "Handling Slack slash command");
      await router.handleSlashCommand?.(command, ack, respond);
    });
    (app as any).command("/remember", async ({ command, ack, respond }) => {
      logger.debug({ command: command.command }, "Handling Slack slash command");
      await router.handleSlashCommand?.(command, ack, respond);
    });
    (app as any).command("/forget_all", async ({ command, ack, respond }) => {
      logger.debug({ command: command.command }, "Handling Slack slash command");
      await router.handleSlashCommand?.(command, ack, respond);
    });
  }
};

export class SlackMessageHandler {
  private app: SlackAppLike;
  private router: MessageRouter;

  constructor(app: SlackAppLike, router: MessageRouter) {
    this.app = app;
    this.router = router;
  }

  registerHandlers(): void {
    registerSlackHandlers(this.app, this.router);
  }
}
