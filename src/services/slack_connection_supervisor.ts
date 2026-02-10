import { logger } from "../utils/logging.ts";
import { RateLimiter, type ApiMethod } from "./rate_limiter.ts";
import { RetryManager } from "./retry_manager.ts";
import { SlackApiOptimizer } from "./slack_api_optimizer.ts";

export type SlackConnectionSupervisorOptions = {
  idleThresholdMs?: number;
  cooldownWindowMs?: number;
  maxCooldownExpiryMs?: number; // Added to prevent extremely long cooldowns
  onActivityCallback?: () => void; // Optional callback to notify of activity
};

export type SlackProbeResult<T> =
  | { status: "executed"; value: T }
  | { status: "skipped"; cooldownUntil: number };

export class SlackConnectionSupervisor {
  private lastActivity = Date.now();
  private lastProbeAt = 0;
  private cooldownExpiresAt = 0;
  private idleThresholdMs: number;
  private cooldownWindowMs: number;
  private maxCooldownExpiryMs: number; // Added to cap maximum cooldown time
  private onActivityCallback?: () => void;

  constructor(
    private optimizer: SlackApiOptimizer,
    private rateLimiter: RateLimiter,
    private retryManager: RetryManager,
    options: SlackConnectionSupervisorOptions = {}
  ) {
    this.idleThresholdMs = options.idleThresholdMs ?? 30_000;
    this.cooldownWindowMs = options.cooldownWindowMs ?? 60_000;
    this.maxCooldownExpiryMs = options.maxCooldownExpiryMs ?? 300_000; // 5 minutes maximum
    this.onActivityCallback = options.onActivityCallback;
  }

  recordActivity(): void {
    this.lastActivity = Date.now();
    if (this.isCooldownExpired()) {
      this.cooldownExpiresAt = 0;
    }
    // Call the activity callback if provided
    this.onActivityCallback?.();
  }

  async runProbe<T>(
    method: ApiMethod,
    operation: () => Promise<T>,
    context: string
  ): Promise<SlackProbeResult<T>> {
    const skipInfo = this.shouldSkipProbe();
    if (skipInfo.skip && skipInfo.cooldownUntil) {
      this.reportCooldown(Math.min(skipInfo.cooldownUntil, Date.now() + this.maxCooldownExpiryMs)); // Cap the cooldown time
      return { status: "skipped", cooldownUntil: Math.min(skipInfo.cooldownUntil, Date.now() + this.maxCooldownExpiryMs) };
    }

    await this.rateLimiter.waitForRequest(method);
    const value = await this.retryManager.executeWithRetry(async () => {
      const response = await operation();
      this.rateLimiter.consumeToken(method);
      return response;
    }, context);

    this.markProbeAllow();
    return { status: "executed", value };
  }

  private shouldSkipProbe(): { skip: boolean; cooldownUntil?: number } {
    const now = Date.now();

    // Check if we're still in a cooldown period
    if (this.cooldownExpiresAt > now) {
      return { skip: true, cooldownUntil: this.cooldownExpiresAt };
    }

    if (now - this.lastActivity < this.idleThresholdMs) {
      return { skip: false };
    }

    if (this.lastProbeAt === 0 || now - this.lastProbeAt >= this.cooldownWindowMs) {
      return { skip: false };
    }

    const cooldownUntil = this.lastProbeAt + this.cooldownWindowMs;
    return { skip: true, cooldownUntil };
  }

  private markProbeAllow(): void {
    this.lastProbeAt = Date.now();
    this.cooldownExpiresAt = 0; // Reset any active cooldown since we just made a successful probe
  }

  private isCooldownExpired(): boolean {
    return this.cooldownExpiresAt > 0 && Date.now() > this.cooldownExpiresAt;
  }

  private reportCooldown(expiresAt: number): void {
    // Cap the expiry time to prevent indefinitely long cooldowns
    const cappedExpiresAt = Math.min(expiresAt, Date.now() + this.maxCooldownExpiryMs);
    this.optimizer.registerCooldown("slack-probe", cappedExpiresAt);
    logger.warn(
      {
        cooldownExpiresAt: new Date(cappedExpiresAt).toISOString(),
        originalExpiresAt: new Date(expiresAt).toISOString(),
        maxCooldownExpiryMs: this.maxCooldownExpiryMs
      },
      "Slack probe deferred while cooldown is active (cooldown capped to prevent excessively long waits)"
    );
  }
}
