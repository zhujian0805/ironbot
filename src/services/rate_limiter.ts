import { logger } from "../utils/logging.jss";

export type RateLimitConfig = {
  enabled: boolean;
  requestsPerSecond: number;
  burstCapacity: number;
  queueSize: number;
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
};

export type ApiMethod = "postMessage" | "setStatus" | "update" | "general";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // tokens per millisecond
}

export class RateLimiter {
  private buckets: Map<ApiMethod, TokenBucket> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.initializeBuckets();
  }

  private initializeBuckets(): void {
    // Different rate limits for different API methods
    const rates: Record<ApiMethod, { requestsPerSecond: number; burstCapacity: number }> = {
      postMessage: { requestsPerSecond: this.config.requestsPerSecond, burstCapacity: this.config.burstCapacity },
      setStatus: { requestsPerSecond: this.config.requestsPerSecond * 2, burstCapacity: this.config.burstCapacity * 2 }, // More lenient for status updates
      update: { requestsPerSecond: this.config.requestsPerSecond, burstCapacity: this.config.burstCapacity },
      general: { requestsPerSecond: this.config.requestsPerSecond, burstCapacity: this.config.burstCapacity }
    };

    for (const [method, limits] of Object.entries(rates)) {
      this.buckets.set(method as ApiMethod, {
        tokens: limits.burstCapacity,
        lastRefill: Date.now(),
        capacity: limits.burstCapacity,
        refillRate: limits.requestsPerSecond / 1000 // tokens per millisecond
      });
    }
  }

  /**
   * Check if a request can be made for the given API method
   * @param method The API method to check
   * @returns true if the request can proceed, false if rate limited
   */
  canMakeRequest(method: ApiMethod): boolean {
    if (!this.config.enabled) {
      return true;
    }

    const bucket = this.buckets.get(method);
    if (!bucket) {
      logger.warn({ method }, "Unknown API method for rate limiting");
      return true;
    }

    this.refillTokens(bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Get the number of milliseconds to wait before the next request can be made
   * @param method The API method to check
   * @returns milliseconds to wait, or 0 if request can proceed immediately
   */
  getWaitTime(method: ApiMethod): number {
    if (!this.config.enabled) {
      return 0;
    }

    const bucket = this.buckets.get(method);
    if (!bucket) {
      return 0;
    }

    this.refillTokens(bucket);

    if (bucket.tokens >= 1) {
      return 0;
    }

    // Calculate how long until we have at least 1 token
    const tokensNeeded = 1 - bucket.tokens;
    return Math.ceil(tokensNeeded / bucket.refillRate);
  }

  /**
   * Wait until a request can be made for the given API method
   * @param method The API method to wait for
   * @returns Promise that resolves when the request can proceed
   */
  async waitForRequest(method: ApiMethod): Promise<void> {
    const waitTime = this.getWaitTime(method);
    if (waitTime > 0) {
      logger.debug({ method, waitTime }, "Rate limiting: waiting before request");
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Force consume a token for the given method (used when request actually succeeds)
   * @param method The API method
   */
  consumeToken(method: ApiMethod): void {
    if (!this.config.enabled) {
      return;
    }

    const bucket = this.buckets.get(method);
    if (!bucket) {
      return;
    }

    this.refillTokens(bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
    }
  }

  /**
   * Get current rate limit status for monitoring
   */
  getStatus(): Record<ApiMethod, { availableTokens: number; capacity: number }> {
    const status: Record<string, { availableTokens: number; capacity: number }> = {};

    for (const [method, bucket] of this.buckets.entries()) {
      this.refillTokens(bucket);
      status[method] = {
        availableTokens: bucket.tokens,
        capacity: bucket.capacity
      };
    }

    return status as Record<ApiMethod, { availableTokens: number; capacity: number }>;
  }

  private refillTokens(bucket: TokenBucket): void {
    const now = Date.now();
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = timePassed * bucket.refillRate;

    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.initializeBuckets(); // Reinitialize buckets with new rates
  }
}