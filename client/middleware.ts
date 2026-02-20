import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes are always allowed
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Home route is always allowed
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Public route prefixes
  const publicRoutePrefixes = [
    "/auth",
    "/reserve",
    "/for-businesses",
    "/for-customers",
    "/docs",
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

  // Protect customer routes - require customer authentication
  if (pathname.startsWith("/customer")) {
    const user = getCurrentUserFromRequest(request);

    if (!user) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (user.type !== "customer") {
      if (user.type === "staff") {
        return NextResponse.redirect(
          new URL("/business/overview", request.url)
        );
      }
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
