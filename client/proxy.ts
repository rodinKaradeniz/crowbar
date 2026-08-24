import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isTrustedMutationRequest } from "@/lib/request-security";

const TOKEN_COOKIE_NAME = "rk-token";

function getCurrentUserFromRequest(
  request: NextRequest
): { type: string; userId: string } | null {
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));

    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }

    return {
      type: payload.user_type || "customer",
      userId: payload.sub,
    };
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Browser mutations routed through the BFF must originate from this site.
  if (pathname.startsWith("/api")) {
    if (!isTrustedMutationRequest({
      method: request.method,
      requestOrigin: request.nextUrl.origin,
      originHeader: request.headers.get("origin"),
      fetchSite: request.headers.get("sec-fetch-site"),
    })) {
      return NextResponse.json({ code: "FORBIDDEN", message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Home route is always allowed
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Public route prefixes
  const publicRoutePrefixes = [
    "/auth",
    "/invite",
    "/reserve",
    "/queue",
    "/menu",
    "/order",
  ];

  const isPublicRoute = publicRoutePrefixes.some((route) =>
    pathname.startsWith(route)
  );

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Protect business routes - require staff authentication
  if (pathname.startsWith("/business")) {
    const user = getCurrentUserFromRequest(request);

    if (!user) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (user.type !== "staff") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
