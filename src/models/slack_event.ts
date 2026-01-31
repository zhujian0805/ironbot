export type SlackEvent = {
  eventType: string;
  userId: string;
  channelId: string;
  text: string;
  timestamp: string;
};
