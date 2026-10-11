export interface RateLimitOptions {
  windowMs: number;
  maxAttempts: number;
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export const LOGIN_RATE_LIMIT: RateLimitOptions = { windowMs: 15 * 60 * 1000, maxAttempts: 30 };

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly now: () => number;

  constructor(private readonly options: RateLimitOptions) {
    this.now = options.now ?? Date.now;
  }

  check(key: string): RateLimitResult {
    const now = this.now();
    const windowStart = now - this.options.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

    if (timestamps.length >= this.options.maxAttempts) {
      this.hits.set(key, timestamps);
      const retryAfterMs = timestamps[0]! + this.options.windowMs - now;
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 0) };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return { allowed: true, remaining: this.options.maxAttempts - timestamps.length, retryAfterMs: 0 };
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
