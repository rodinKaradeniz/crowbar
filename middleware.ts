import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { mockCustomers, mockStaff } from "@/mock-data";
import { Customer, Staff } from "@/types";

const SESSION_COOKIE_NAME = "rk-session";

type AuthUser = Customer | Staff;

function getCurrentUserFromRequest(request: NextRequest): AuthUser | null {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  try {
    const userData = JSON.parse(sessionId) as AuthUser;

    // Verify user still exists in mock data
    if (userData.type === "customer") {
      const found = mockCustomers.find((c) => c.id === userData.id);
      return found || null;
    } else {
      const found = mockStaff.find((s) => s.id === userData.id);
      return found || null;
    }
  } catch (error) {
    console.error("[Middleware] Error parsing session:", error);
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes are always allowed (check BEFORE public routes)
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Check for exact home route first
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Public route prefixes (excluding "/" which we already handled)
  const publicRoutePrefixes = [
    "/auth",
    "/reserve",
    "/for-venues",
    "/for-customers",
  ];

  // Check if current path starts with a public route prefix
  const isPublicRoute = publicRoutePrefixes.some((route) =>
    pathname.startsWith(route)
  );

  // Allow public routes
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Protect venue routes - require staff authentication
  if (pathname.startsWith("/venue")) {
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
        return NextResponse.redirect(new URL("/venue/overview", request.url));
      }
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  // Allow all other routes (catch-all)
  return NextResponse.next();
}

// Configure which routes should run middleware
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
