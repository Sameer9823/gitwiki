// Tests for rate limiting and error handling
import { checkRateLimit, getRatelimiter } from "@/lib/ratelimit";
import { withRateLimit } from "@/lib/withRateLimit";
import { handleError, AppError, ValidationError, NotFoundError, UnauthorizedError } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";

async function getResponseBody(response: NextResponse) {
  return response.json();
}

describe("Rate Limiting", () => {
  test("returns null when Redis not configured", async () => {
    // Ensure no Redis env vars
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const result = await checkRateLimit("test-key", { requests: 10, windowMs: 60000 });
    expect(result).toBeNull();
  });

  test("getRatelimiter returns null without Redis", () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    const limiter = getRatelimiter({ requests: 10, windowMs: 60000 });
    expect(limiter).toBeNull();
  });
});

describe("Error Handling", () => {
  test("handles ZodError", async () => {
    const { ZodError } = require("zod");
    const error = new ZodError([
      { code: "invalid_type", expected: "string", received: "undefined", path: ["name"], message: "Required" },
    ]);

    const response = handleError(error);
    expect(response.status).toBe(400);
    const body = await getResponseBody(response);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  test("handles AppError subclasses", async () => {
    const errors = [
      new NotFoundError("Repository"),
      new UnauthorizedError("Invalid token"),
      new ValidationError("Invalid input", { field: "error" }),
    ];

    for (const error of errors) {
      const response = handleError(error);
      expect(response.status).toBe(error.statusCode);
      const body = await getResponseBody(response);
      expect(body.code).toBe(error.code);
    }
  });

  test("handles generic Error", async () => {
    const response = handleError(new Error("Something went wrong"));
    expect(response.status).toBe(500);
    const body = await getResponseBody(response);
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  test("handles unknown errors", async () => {
    const response = handleError("string error");
    expect(response.status).toBe(500);
    const body = await getResponseBody(response);
    expect(body.code).toBe("UNKNOWN_ERROR");
  });

  test("handles Prisma P2002 error", async () => {
    const error = new Error("Unique constraint failed");
    error.name = "PrismaClientKnownRequestError";
    (error as any).code = "P2002";

    const response = handleError(error);
    expect(response.status).toBe(409);
    const body = await getResponseBody(response);
    expect(body.code).toBe("CONFLICT");
  });

  test("handles Prisma P2025 error", async () => {
    const error = new Error("Record not found");
    error.name = "PrismaClientKnownRequestError";
    (error as any).code = "P2025";

    const response = handleError(error);
    expect(response.status).toBe(404);
    const body = await getResponseBody(response);
    expect(body.code).toBe("NOT_FOUND");
  });
});

describe("withRateLimit wrapper", () => {
  test("calls handler when rate limit not exceeded (no Redis)", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;

    const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withRateLimit(handler, { requests: 10, window: "1 m", keyPrefix: "test" });

    const req = new NextRequest("http://localhost/api/test", { method: "POST" });
    const response = await wrapped(req);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    // When Redis is not configured, no rate limit headers are added
    expect(response.headers.get("X-RateLimit-Limit")).toBeNull();
  });

  test("does not add rate limit headers when Redis not configured", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;

    const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withRateLimit(handler, { requests: 10, window: "1 m", keyPrefix: "test" });

    const req = new NextRequest("http://localhost/api/test", { method: "POST" });
    const response = await wrapped(req);

    // Without Redis, rate limiting is skipped, so no headers
    expect(response.headers.get("X-RateLimit-Limit")).toBeNull();
    expect(response.headers.get("X-RateLimit-Remaining")).toBeNull();
    expect(response.headers.get("X-RateLimit-Reset")).toBeNull();
  });
});