import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface RateLimitConfig {
  requests: number;
  windowMs: number; // milliseconds, e.g., 60_000 for 1 minute
}

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const ratelimitCache = new Map<string, Ratelimit>();

function msToDuration(ms: number): string {
  if (ms >= 86_400_000) return `${Math.floor(ms / 86_400_000)} d`;
  if (ms >= 3_600_000) return `${Math.floor(ms / 3_600_000)} h`;
  if (ms >= 60_000) return `${Math.floor(ms / 60_000)} m`;
  return `${Math.floor(ms / 1000)} s`;
}

export function getRatelimiter(config: RateLimitConfig): Ratelimit | null {
  if (!redis) return null;

  const key = `${config.requests}:${config.windowMs}`;
  if (!ratelimitCache.has(key)) {
    ratelimitCache.set(
      key,
      new Ratelimit({
        redis,
        // @ts-expect-error Duration type is string-based in practice
        limiter: Ratelimit.slidingWindow(config.requests, msToDuration(config.windowMs)),
        analytics: true,
        prefix: "gitwiki:ratelimit",
      })
    );
  }
  return ratelimitCache.get(key)!;
}

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<{ success: boolean; limit: number; remaining: number; reset: number } | null> {
  const limiter = getRatelimiter(config);
  if (!limiter) return null; // No Redis configured — skip rate limiting

  const result = await limiter.limit(identifier);
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}