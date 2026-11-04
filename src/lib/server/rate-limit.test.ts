import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./http";
import { rateLimit } from "./rate-limit";

afterEach(() => vi.unstubAllEnvs());

describe("in-memory rate limiter", () => {
  it("blocks a key after the configured limit", () => {
    const key = `test:${crypto.randomUUID()}`;
    rateLimit(key, 2, 60_000);
    rateLimit(key, 2, 60_000);
    expect(() => rateLimit(key, 2, 60_000)).toThrowError(ApiError);
  });

  it("fails closed when multiple Node workers are configured", () => {
    vi.stubEnv("WEB_CONCURRENCY", "2");
    expect(() => rateLimit(`test:${crypto.randomUUID()}`, 1, 60_000)).toThrowError(/один процесс/);
  });
});
