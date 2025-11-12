/// <reference types="@cloudflare/workers-types" />

import { describe, it, expect, vi } from "vitest";
import { Env } from "./index";

import { enforceRateLimit, applyRateLimitHeaders } from "./index";

const mockKvCache = () => {
  const store = new Map<string, { value: string; expiration?: number }>();
  return {
    get: vi.fn(async (key: string) => {
      const entry = store.get(key);
      if (entry && (entry.expiration === undefined || entry.expiration > Date.now() / 1000)) {
        return entry.value;
      }
      if (entry) {
        store.delete(key);
      }
      return null;
    }),
    put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
      let expiration: number | undefined;
      if (options?.expirationTtl) {
        expiration = Date.now() / 1000 + options.expirationTtl;
      }
      store.set(key, { value, expiration });
    })
  };
};

describe("enforceRateLimit", () => {
  it("should allow a request under the limit", async () => {
    const env = {
      KV_CACHE: mockKvCache(),
      RATE_LIMIT_MAX: "10",
      RATE_LIMIT_WINDOW: "60"
    } as unknown as Env;

    const result = await enforceRateLimit("user-1", env);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("should block a request over the limit", async () => {
    const env = {
      KV_CACHE: mockKvCache(),
      RATE_LIMIT_MAX: "1",
      RATE_LIMIT_WINDOW: "60"
    } as unknown as Env;

    await enforceRateLimit("user-2", env);
    const result = await enforceRateLimit("user-2", env);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should apply rate limit headers", () => {
    const headers = new Headers();
    const result = {
      allowed: true,
      remaining: 9,
      reset: Date.now() + 60000
    };
    applyRateLimitHeaders(headers, result, 10);
    expect(headers.get("X-RateLimit-Limit")).toBe("10");
    expect(headers.get("X-RateLimit-Remaining")).toBe("9");
    expect(headers.get("X-RateLimit-Reset")).toBe(String(Math.floor(result.reset / 1000)));
  });
});
