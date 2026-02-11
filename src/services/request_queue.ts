import { logger } from "../utils/logging.ts";
import type { ApiMethod } from "./rate_limiter.ts";

export type QueuePriority = "high" | "medium" | "low";

export interface QueuedRequest {
  id: string;
  method: ApiMethod;
  priority: QueuePriority;
  request: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
  retryCount: number;
}

export class RequestQueue {
  private queues: Map<QueuePriority, QueuedRequest[]> = new Map([
    ["high", []],
    ["medium", []],
    ["low", []]
  ]);

  private activeRequests = 0;
  private maxConcurrency: number;
  private circuitBreakerFailures = 0;
  private circuitBreakerLastFailure = 0;
  private circuitBreakerTimeout = 60000; // 1 minute
  private circuitBreakerThreshold = 5; // failures before opening circuit
  private isCircuitOpen = false;

  constructor(maxConcurrency: number, private queueSize: number) {
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Add a request to the queue
   */
  async enqueue<T>(
    method: ApiMethod,
    priority: QueuePriority,
    requestFn: () => Promise<T>
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Check circuit breaker first
      if (this.isCircuitOpen) {
        const timeSinceLastFailure = Date.now() - this.circuitBreakerLastFailure;
        if (timeSinceLastFailure < this.circuitBreakerTimeout) {
          logger.debug({ timeSinceLastFailure, timeout: this.circuitBreakerTimeout }, "Circuit breaker open, rejecting request");
          reject(new Error("Circuit breaker is open"));
          return;
        }
        // Try to close the circuit
        this.isCircuitOpen = false;
        this.circuitBreakerFailures = 0;
        logger.info("Circuit breaker closed, accepting request");
      }

      const queuedRequest: QueuedRequest = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        method,
        priority,
        request: requestFn,
        resolve,
        reject,
        timestamp: Date.now(),
        retryCount: 0
      };

      const queue = this.queues.get(priority)!;

      // Check queue size limit
      const totalQueued = Array.from(this.queues.values()).reduce((sum, q) => sum + q.length, 0);
      if (totalQueued >= this.queueSize) {
        logger.warn({ priority, queueSize: this.queueSize }, "Request queue full, rejecting request");
        reject(new Error("Request queue is full"));
        return;
      }

      queue.push(queuedRequest);
      logger.debug({ id: queuedRequest.id, method, priority, queueLength: queue.length }, "Request queued");

      this.processQueue();
    });
  }

  /**
   * Process the next request in the queue
   */
  private async processQueue(): Promise<void> {
    // Check circuit breaker
    if (this.isCircuitOpen) {
      const timeSinceLastFailure = Date.now() - this.circuitBreakerLastFailure;
      if (timeSinceLastFailure < this.circuitBreakerTimeout) {
        logger.debug({ timeSinceLastFailure, timeout: this.circuitBreakerTimeout }, "Circuit breaker open, skipping queue processing");
        return;
      }
      // Try to close the circuit
      this.isCircuitOpen = false;
      this.circuitBreakerFailures = 0;
      logger.info("Circuit breaker closed, resuming request processing");
    }

    // Check concurrency limit
    if (this.activeRequests >= this.maxConcurrency) {
      return;
    }

    // Find the highest priority request
    const highQueue = this.queues.get("high")!;
    const mediumQueue = this.queues.get("medium")!;
    const lowQueue = this.queues.get("low")!;

    let nextRequest: QueuedRequest | undefined;

    if (highQueue.length > 0) {
      nextRequest = highQueue.shift()!;
    } else if (mediumQueue.length > 0) {
      nextRequest = mediumQueue.shift()!;
    } else if (lowQueue.length > 0) {
      nextRequest = lowQueue.shift()!;
    }

    if (!nextRequest) {
      return;
    }

    this.activeRequests++;
    logger.debug({ id: nextRequest.id, activeRequests: this.activeRequests }, "Processing queued request");

    try {
      const result = await nextRequest.request();
      nextRequest.resolve(result);
      this.onRequestSuccess();
    } catch (error) {
      this.onRequestFailure(error as Error, nextRequest);
      nextRequest.reject(error);
    } finally {
      this.activeRequests--;
      // Process next request
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Handle successful request
   */
  private onRequestSuccess(): void {
    // Reset circuit breaker on success
    this.circuitBreakerFailures = 0;
  }

  /**
   * Handle failed request
   */
  private onRequestFailure(error: Error, request: QueuedRequest): void {
    this.circuitBreakerFailures++;
    this.circuitBreakerLastFailure = Date.now();

    // Check if we should open the circuit breaker
    if (this.circuitBreakerFailures >= this.circuitBreakerThreshold) {
      this.isCircuitOpen = true;
      logger.warn({
        failures: this.circuitBreakerFailures,
        threshold: this.circuitBreakerThreshold
      }, "Circuit breaker opened due to repeated failures");
    }

    logger.error({
      error: error.message,
      id: request.id,
      method: request.method,
      retryCount: request.retryCount
    }, "Request failed");
  }

  /**
   * Get queue statistics for monitoring
   */
  getStats(): {
    queued: Record<QueuePriority, number>;
    activeRequests: number;
    maxConcurrency: number;
    circuitBreaker: {
      isOpen: boolean;
      failures: number;
      lastFailure: number;
    };
  } {
    return {
      queued: {
        high: this.queues.get("high")!.length,
        medium: this.queues.get("medium")!.length,
        low: this.queues.get("low")!.length
      },
      activeRequests: this.activeRequests,
      maxConcurrency: this.maxConcurrency,
      circuitBreaker: {
        isOpen: this.isCircuitOpen,
        failures: this.circuitBreakerFailures,
        lastFailure: this.circuitBreakerLastFailure
      }
    };
  }

  /**
   * Clear all queued requests (for shutdown)
   */
  clear(): void {
    for (const queue of this.queues.values()) {
      for (const request of queue) {
        request.reject(new Error("Request queue cleared"));
      }
      queue.length = 0;
    }
    logger.info("Request queue cleared");
  }

  /**
   * Get priority for an API method
   */
  static getPriorityForMethod(method: ApiMethod): QueuePriority {
    switch (method) {
      case "postMessage":
        return "high"; // User responses are highest priority
      case "setStatus":
        return "medium"; // Status updates are medium priority
      case "update":
        return "high"; // Message updates are high priority
      case "general":
        return "low"; // General API calls are low priority
      default:
        return "low";
    }
  }
}