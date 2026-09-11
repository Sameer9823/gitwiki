import { auth } from "@/lib/auth";
import { securityHeadersMiddleware } from "@/middleware/securityHeaders";

const PUBLIC_PATHS = ["/api/auth", "/api/health", "/api/webhooks", "/api/inngest", "/login", "/invite"];
const PUBLIC_PREFIXES = ["/_next", "/favicon", "/api/auth"];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) || PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
}

export default auth((request) => {
  const pathname = request.nextUrl.pathname;

  // Enforce auth on protected areas even though `auth` by itself only decorates
  // the request — without this, unauthenticated visits to /dashboard or /repo/*
  // silently return null from the page handler and render a blank page.
  if (!isPublicPath(pathname)) {
    const session = (request as unknown as { auth?: { user?: { id?: string } } }).auth;
    if (!session?.user?.id && (pathname.startsWith("/dashboard") || pathname.startsWith("/repo"))) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return Response.redirect(loginUrl);
    }
  }

  const response = securityHeadersMiddleware(request);
  return response;
});

export const config = {
  matcher: ["/:path*"],
};
