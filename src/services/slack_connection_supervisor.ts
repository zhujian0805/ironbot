import { logger } from "../utils/logging.ts";
import { RateLimiter, type ApiMethod } from "./rate_limiter.ts";
import { RetryManager } from "./retry_manager.ts";
import { SlackApiOptimizer } from "./slack_api_optimizer.ts";

export type SlackConnectionSupervisorOptions = {
  idleThresholdMs?: number;
  cooldownWindowMs?: number;
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

  constructor(
    private optimizer: SlackApiOptimizer,
    private rateLimiter: RateLimiter,
    private retryManager: RetryManager,
    options: SlackConnectionSupervisorOptions = {}
  ) {
    this.idleThresholdMs = options.idleThresholdMs ?? 30_000;
    this.cooldownWindowMs = options.cooldownWindowMs ?? 60_000;
  }

  recordActivity(): void {
    this.lastActivity = Date.now();
    if (this.isCooldownExpired()) {
      this.cooldownExpiresAt = 0;
    }
  }

  async runProbe<T>(
    method: ApiMethod,
    operation: () => Promise<T>,
    context: string
  ): Promise<SlackProbeResult<T>> {
    const skipInfo = this.shouldSkipProbe();
    if (skipInfo.skip && skipInfo.cooldownUntil) {
      this.reportCooldown(skipInfo.cooldownUntil);
      return { status: "skipped", cooldownUntil: skipInfo.cooldownUntil };
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
    this.cooldownExpiresAt = this.lastProbeAt + this.cooldownWindowMs;
  }

  private isCooldownExpired(): boolean {
    return this.cooldownExpiresAt > 0 && Date.now() > this.cooldownExpiresAt;
  }

  private reportCooldown(expiresAt: number): void {
    this.optimizer.registerCooldown("slack-probe", expiresAt);
    logger.warn(
      { cooldownExpiresAt: new Date(expiresAt).toISOString() },
      "Slack probe deferred while cooldown is active"
    );
  }
}
