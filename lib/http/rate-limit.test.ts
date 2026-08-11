import { describe, expect, it } from "vitest";

import { consumeRateLimit, requestIdentifier } from "./rate-limit";

describe("research rate limiting", () => {
  it("allows requests through the configured limit and then rejects", () => {
    const scope = `test-${Math.random()}`;
    expect(consumeRateLimit(scope, "client", { limit: 2, now: 1 }).allowed).toBe(true);
    expect(consumeRateLimit(scope, "client", { limit: 2, now: 2 }).allowed).toBe(true);
    expect(consumeRateLimit(scope, "client", { limit: 2, now: 3 }).allowed).toBe(false);
  });

  it("starts a fresh bucket after the window expires", () => {
    const scope = `test-${Math.random()}`;
    consumeRateLimit(scope, "client", { limit: 1, windowMs: 10, now: 1 });
    expect(consumeRateLimit(scope, "client", { limit: 1, windowMs: 10, now: 20 }).allowed).toBe(true);
  });

  it("prefers Cloudflare's trusted client address", () => {
    expect(
      requestIdentifier(
        new Headers({ "cf-connecting-ip": "203.0.113.8", "x-forwarded-for": "10.0.0.1" }),
      ),
    ).toBe("203.0.113.8");
  });
});
