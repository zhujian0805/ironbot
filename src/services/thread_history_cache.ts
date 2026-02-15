import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export type SlackMessage = {
  type: string;
  user?: string;
  text: string;
  ts: string;
  username?: string;
  bot_id?: string;
};

type CacheEntry = {
  messages: SlackMessage[];
  timestamp: number;
};

/**
 * In-memory cache for Slack thread history
 * Stores thread history with TTL to avoid redundant API calls
 */
export class ThreadHistoryCache {
  private cache: Map<string, CacheEntry> = new Map();
  private ttlMs: number;

  constructor(ttlMs: number = 5 * 60 * 1000) {
    // Default 5 minutes
    this.ttlMs = ttlMs;
  }

  /**
   * Generate cache key from channel and thread timestamp
   */
  private getCacheKey(channel: string, threadTs: string): string {
    return `${channel}:${threadTs}`;
  }

  /**
   * Store messages in cache
   */
  set(channel: string, threadTs: string, messages: SlackMessage[]): void {
    const key = this.getCacheKey(channel, threadTs);
    this.cache.set(key, {
      messages,
      timestamp: Date.now()
    });
  }

  /**
   * Retrieve messages from cache if not expired
   */
  get(channel: string, threadTs: string): SlackMessage[] | null {
    const key = this.getCacheKey(channel, threadTs);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    const age = Date.now() - entry.timestamp;
    if (age > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.messages;
  }

  /**
   * Check if cache has valid entry
   */
  has(channel: string, threadTs: string): boolean {
    return this.get(channel, threadTs) !== null;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache size for monitoring
   */
  size(): number {
    return this.cache.size;
  }
}
