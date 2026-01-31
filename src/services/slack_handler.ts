import { logger } from "../utils/logging.js";

export type SlackAppLike = {
  event: (eventName: string, handler: (args: any) => Promise<void>) => void;
};

export type MessageRouter = {
  handleAppMention: (event: any, say: (message: string) => Promise<void>) => Promise<void>;
  handleMessage?: (event: any, say: (message: string) => Promise<void>) => Promise<void>;
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

      logger.debug({ eventType: "message" }, "Handling Slack direct message event");
      await router.handleMessage?.(event, say);
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
