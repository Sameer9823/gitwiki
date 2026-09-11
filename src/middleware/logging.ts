import { NextRequest, NextResponse } from "next/server";

export function withLogging(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const start = Date.now();
    const method = req.method;
    const url = req.url;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
               req.headers.get("x-real-ip") || 
               "unknown";

    let userId: string | undefined;
    try {
      // Try to get user ID from auth cookie/session
      // This is a lightweight check - actual auth happens in the handler
      const authCookie = req.cookies.get("next-auth.session-token") || 
                         req.cookies.get("__session");
      if (authCookie) userId = "authenticated";
    } catch {
      // Ignore auth errors in logging
    }

    let response: NextResponse;
    try {
      response = await handler(req);
    } catch (error) {
      const duration = Date.now() - start;
      console.error(
        JSON.stringify({
          level: "error",
          method,
          url,
          status: 500,
          duration,
          ip,
          userId,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      throw error;
    }

    const duration = Date.now() - start;

    // Log structured request info
    const logData = {
      level: response.status >= 400 ? "warn" : "info",
      method,
      url,
      status: response.status,
      duration,
      ip,
      userId,
    };

    if (process.env.NODE_ENV === "production") {
      // In production, output as JSON for log aggregation
      console.log(JSON.stringify(logData));
    } else {
      // In dev, pretty print
      const statusColor = response.status >= 500 ? "\x1b[31m" : 
                          response.status >= 400 ? "\x1b[33m" : "\x1b[32m";
      const reset = "\x1b[0m";
      console.log(
        `${method} ${url} ${statusColor}${response.status}${reset} ` +
        `${duration}ms ${ip} ${userId ? `user:${userId}` : "anon"}`
      );
    }

    return response;
  };
}

// Utility to add logging to any API route handler
export function createLoggedHandler(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return withLogging(handler);
}
