import { NextResponse, NextRequest } from "next/server";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Rate limit exceeded", public retryAfter?: number) {
    super(message, 429, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

function reportToSentry(error: unknown, context?: any) {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
}

export function handleError(error: unknown, context?: any): NextResponse {
  // Report to Sentry for non-validation errors
  if (!(error instanceof ZodError) && !(error instanceof ValidationError)) {
    reportToSentry(error, context);
  }

  console.error("[ERROR]", error, context ?? "");

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid request",
        code: "VALIDATION_ERROR",
        details: error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  if (error instanceof AppError) {
    const headers: Record<string, string> = {};
    if (error instanceof RateLimitError && error.retryAfter) {
      headers["Retry-After"] = error.retryAfter.toString();
    }
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.statusCode, headers }
    );
  }

  if (error instanceof Error) {
    // Prisma errors
    if (error.name === "PrismaClientKnownRequestError") {
      const prismaError = error as any;
      if (prismaError.code === "P2002") {
        return NextResponse.json(
          { error: "Resource already exists", code: "CONFLICT" },
          { status: 409 }
        );
      }
      if (prismaError.code === "P2025") {
        return NextResponse.json(
          { error: "Resource not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: error.message, code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { error: "An unexpected error occurred", code: "UNKNOWN_ERROR" },
    { status: 500 }
  );
}

export function asyncHandler(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    try {
      return await handler(req, context as Record<string, unknown>);
    } catch (error) {
      return handleError(error, { url: req.url, method: req.method });
    }
  };
}