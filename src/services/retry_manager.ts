import { logger } from "../utils/logging.ts";

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMax: number; // Maximum jitter as fraction of delay (0.1 = 10%)
}

export type RetryContext = string | (Record<string, unknown> & { label?: string });

export class RetryManager {
  private config: RetryConfig;

  constructor(config: RetryConfig) {
    this.config = config;
  }

  /**
   * Execute a function with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context?: RetryContext,
    options?: { shouldRetry?: (error: unknown) => boolean }
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        if (attempt > 0) {
          logger.info({ attempt, ...formatContext(context) }, "Operation succeeded after retry");
        }
        return result;
      } catch (error) {
        lastError = error as Error;

        // Check if we should retry
        const shouldRetry = options?.shouldRetry?.(error) ?? this.isRateLimitError(error);
        const isLastAttempt = attempt === this.config.maxAttempts;

        if (isLastAttempt || !shouldRetry) {
          logger.error({
            error: lastError.message,
            attempt,
            maxAttempts: this.config.maxAttempts,
            shouldRetry,
            ...formatContext(context)
          }, "Operation failed, giving up");
          throw lastError;
        }

        const delay = this.calculateDelay(attempt);
        logger.warn({
          error: lastError.message,
          attempt,
          delay,
          ...formatContext(context)
        }, "Operation failed, retrying after delay");

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Check if an error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    // Check for HTTP 429 status
    if (error?.status === 429) {
      return true;
    }

    // Check for rate limit related error messages
    const message = error?.message?.toLowerCase() || "";
    return message.includes("rate limit") ||
           message.includes("too many requests") ||
           message.includes("throttled");
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt);
    const delayWithCap = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = delayWithCap * this.config.jitterMax * Math.random();
    const finalDelay = delayWithCap + jitter;

    return Math.floor(finalDelay);
  }

  /**
   * Sleep for the specified number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    const delay = Number.isFinite(ms) && ms >= 0 ? ms : this.config.baseDelayMs;
    if (delay !== ms) {
      console.warn(`TimeoutNaNWarning: ${ms} is not a valid number. Defaulting to ${delay}ms.`);
    }
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Get retry statistics for monitoring
   */
  getStats(): {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    jitterMax: number;
  } {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

const formatContext = (context?: RetryContext): Record<string, unknown> => {
  if (!context) return {};
  if (typeof context === "string") {
    return { context };
  }
  const { label, ...rest } = context;
  const filteredDetails = Object.entries(rest).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
  if (label) {
    return {
      context: label,
      ...(Object.keys(filteredDetails).length ? { contextDetails: filteredDetails } : {})
    };
  }
  return Object.keys(filteredDetails).length ? { contextDetails: filteredDetails } : {};
};
