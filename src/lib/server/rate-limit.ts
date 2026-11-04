import { ApiError } from "./http";

type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();
const MAX_BUCKETS = 10_000;
let operations = 0;

function enforceSupportedDeployment() {
  const workers = Number(process.env.WEB_CONCURRENCY ?? "1");
  if (!Number.isFinite(workers) || workers < 1) throw new ApiError(503, "RATE_LIMIT_CONFIG", "Некорректный WEB_CONCURRENCY");
  if (workers !== 1) {
    throw new ApiError(503, "RATE_LIMIT_CONFIG", "До подключения общего atomic rate limiter поддерживается только один процесс приложения");
  }
}

function sweep(now: number) {
  for (const [key, entry] of buckets) if (entry.resetAt <= now) buckets.delete(key);
}

export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = process.env.TRUST_PROXY === "true" && forwarded ? forwarded : "direct";
  return `${scope}:${ip}`;
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  enforceSupportedDeployment();
  const now = Date.now();
  operations += 1;
  if (operations % 100 === 0) sweep(now);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      sweep(now);
      if (buckets.size >= MAX_BUCKETS) throw new ApiError(429, "RATE_LIMIT_CAPACITY", "Слишком много запросов. Попробуйте позже");
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) throw new ApiError(429, "RATE_LIMIT", "Слишком много запросов. Попробуйте позже");
}

// This bounded in-memory store deliberately supports one Node process only.
// Horizontal scaling requires replacing it with an atomic shared store before WEB_CONCURRENCY is increased.
