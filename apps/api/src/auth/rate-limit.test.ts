import { describe, expect, it } from "vitest";

import { SlidingWindowRateLimiter } from "./rate-limit.js";

function createClock(start = 1_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("SlidingWindowRateLimiter", () => {
  it("allows attempts up to the limit and reports remaining capacity", () => {
    const clock = createClock();
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, maxAttempts: 3, now: clock.now });

    expect(limiter.check("1.2.3.4")).toMatchObject({ allowed: true, remaining: 2 });
    expect(limiter.check("1.2.3.4")).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("1.2.3.4")).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("blocks attempts beyond the limit and reports retry delay", () => {
    const clock = createClock();
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, maxAttempts: 2, now: clock.now });
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");

    const blocked = limiter.check("1.2.3.4");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(60_000);
  });

  it("tracks each key independently", () => {
    const clock = createClock();
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, maxAttempts: 1, now: clock.now });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("forgets attempts once the window slides past them", () => {
    const clock = createClock();
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, maxAttempts: 1, now: clock.now });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    clock.advance(60_001);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("clears attempts when a key is reset after success", () => {
    const clock = createClock();
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, maxAttempts: 1, now: clock.now });
    expect(limiter.check("a").allowed).toBe(true);
    limiter.reset("a");
    expect(limiter.check("a").allowed).toBe(true);
  });
});
