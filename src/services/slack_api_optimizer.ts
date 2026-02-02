import { logger } from "../utils/logging.ts";

interface DebouncedOperation<T extends any[]> {
  key: string;
  operation: (...args: T) => Promise<void>;
  timeoutId: NodeJS.Timeout | null;
  lastArgs: T | null;
  debounceMs: number;
}

export class SlackApiOptimizer {
  private debouncedOperations = new Map<string, DebouncedOperation<any[]>>();
  private typingIndicators = new Map<string, { channelId: string; threadTs?: string; timeoutId: NodeJS.Timeout }>();

  /**
   * Debounce an operation by key
   */
  debounce<T extends any[]>(
    key: string,
    operation: (...args: T) => Promise<void>,
    debounceMs: number,
    ...args: T
  ): void {
    const existing = this.debouncedOperations.get(key);

    if (existing) {
      // Update the last args and reset timeout
      existing.lastArgs = args;
      if (existing.timeoutId) {
        clearTimeout(existing.timeoutId);
      }
    } else {
      // Create new debounced operation
      this.debouncedOperations.set(key, {
        key,
        operation,
        timeoutId: null,
        lastArgs: args,
        debounceMs
      });
    }

    const debouncedOp = this.debouncedOperations.get(key)!;

    debouncedOp.timeoutId = setTimeout(async () => {
      try {
        if (debouncedOp.lastArgs) {
          await debouncedOp.operation(...debouncedOp.lastArgs);
        }
      } catch (error) {
        logger.error({ error: (error as Error).message, key }, "Debounced operation failed");
      } finally {
        this.debouncedOperations.delete(key);
      }
    }, debounceMs);
  }

  /**
   * Cancel a debounced operation
   */
  cancelDebounce(key: string): void {
    const existing = this.debouncedOperations.get(key);
    if (existing && existing.timeoutId) {
      clearTimeout(existing.timeoutId);
      this.debouncedOperations.delete(key);
    }
  }

  /**
   * Set typing indicator with debouncing
   */
  setTypingIndicator(
    channelId: string,
    threadTs: string | undefined,
    setStatusFn: (channelId: string, threadTs: string | undefined, status: string) => Promise<void>,
    durationMs: number = 3000
  ): void {
    const key = `typing-${channelId}-${threadTs || "root"}`;

    // Cancel any existing typing indicator for this channel/thread
    this.clearTypingIndicator(key);

    // Set new typing indicator
    this.typingIndicators.set(key, {
      channelId,
      threadTs,
      timeoutId: setTimeout(() => {
        // Clear typing status after duration
        setStatusFn(channelId, threadTs, "").catch(error => {
          logger.warn({ error: (error as Error).message, channelId, threadTs }, "Failed to clear typing status");
        });
        this.typingIndicators.delete(key);
      }, durationMs)
    });

    // Set typing status immediately
    setStatusFn(channelId, threadTs, "is typing...").catch(error => {
      logger.warn({ error: (error as Error).message, channelId, threadTs }, "Failed to set typing status");
    });
  }

  /**
   * Clear typing indicator
   */
  clearTypingIndicator(key: string): void {
    const existing = this.typingIndicators.get(key);
    if (existing) {
      if (existing.timeoutId) {
        clearTimeout(existing.timeoutId);
      }
      this.typingIndicators.delete(key);
    }
  }

  /**
   * Clear all typing indicators (for shutdown)
   */
  clearAllTypingIndicators(): void {
    for (const [key, indicator] of this.typingIndicators.entries()) {
      if (indicator.timeoutId) {
        clearTimeout(indicator.timeoutId);
      }
    }
    this.typingIndicators.clear();
    logger.debug("All typing indicators cleared");
  }

  /**
   * Batch multiple operations of the same type
   */
  async batchOperations<T, R>(
    operations: Array<() => Promise<T>>,
    batchSize: number = 5,
    delayBetweenBatches: number = 100
  ): Promise<T[]> {
    const results: T[] = [];

    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);

      // Execute batch in parallel
      const batchPromises = batch.map(op => op());
      const batchResults = await Promise.allSettled(batchPromises);

      // Collect results
      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          logger.error({ error: result.reason.message }, "Batch operation failed");
          // Re-throw to maintain error handling
          throw result.reason;
        }
      }

      // Delay between batches to avoid overwhelming the API
      if (i + batchSize < operations.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    return results;
  }

  /**
   * Optimize connection pooling (placeholder for future enhancements)
   */
  optimizeConnectionPool(): void {
    // This could be enhanced to implement connection pooling
    // For now, it's a placeholder
    logger.debug("Connection pool optimization not implemented yet");
  }

  /**
   * Get statistics for monitoring
   */
  getStats(): {
    activeDebouncedOperations: number;
    activeTypingIndicators: number;
  } {
    return {
      activeDebouncedOperations: this.debouncedOperations.size,
      activeTypingIndicators: this.typingIndicators.size
    };
  }

  /**
   * Shutdown the optimizer
   */
  shutdown(): void {
    // Clear all debounced operations
    for (const [key, operation] of this.debouncedOperations.entries()) {
      if (operation.timeoutId) {
        clearTimeout(operation.timeoutId);
      }
    }
    this.debouncedOperations.clear();

    // Clear all typing indicators
    this.clearAllTypingIndicators();

    logger.info("Slack API optimizer shutdown complete");
  }
}