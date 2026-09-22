import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/ratelimit";

function parseWindow(window: string): number {
  const match = window.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) return 60_000; // default 1 minute
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 60_000;
  }
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "anonymous";
}

export interface RateLimitOptions {
  requests: number;
  window: string; // e.g., "30 s", "1 m", "1 h"
  keyPrefix?: string;
}

export function withRateLimit(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>,
  options: RateLimitOptions
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    const identifier = options.keyPrefix
      ? `${options.keyPrefix}:${getClientIp(req)}`
      : getClientIp(req);

    const result = await checkRateLimit(identifier, {
      requests: options.requests,
      windowMs: parseWindow(options.window),
    });

    if (result && !result.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": result.limit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": result.reset.toString(),
            "Retry-After": Math.ceil((result.reset - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    const response = await handler(req, context);

    if (result) {
      response.headers.set("X-RateLimit-Limit", result.limit.toString());
      response.headers.set("X-RateLimit-Remaining", result.remaining.toString());
      response.headers.set("X-RateLimit-Reset", result.reset.toString());
    }

    return response;
  };
}