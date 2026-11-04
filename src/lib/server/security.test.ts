import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./http";
import { verifyOrigin } from "./security";

vi.mock("./db", () => ({ db: {} }));

afterEach(() => vi.unstubAllEnvs());

describe("verifyOrigin", () => {
  it("accepts only the configured origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRUSTED_ORIGIN", "https://coffee.example");
    expect(() => verifyOrigin(new Request("https://internal.example/api", { headers: { origin: "https://coffee.example" } }))).not.toThrow();
    expect(() => verifyOrigin(new Request("https://internal.example/api", { headers: { origin: "https://evil.example" } }))).toThrowError(ApiError);
  });

  it("fails closed in production without TRUSTED_ORIGIN", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRUSTED_ORIGIN", "");
    expect(() => verifyOrigin(new Request("https://coffee.example/api", { headers: { origin: "https://coffee.example" } }))).toThrowError(/TRUSTED_ORIGIN/);
  });

  it("rejects a configured URL with a path or trailing slash", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRUSTED_ORIGIN", "https://coffee.example/admin/");
    expect(() => verifyOrigin(new Request("https://coffee.example/api", { headers: { origin: "https://coffee.example" } }))).toThrowError(/только origin/);
  });
});
