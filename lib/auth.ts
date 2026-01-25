import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { mockAuth, mockCustomers, mockStaff } from "@/mock-data";
import { Customer, Staff } from "@/types";

export type AuthUser = Customer | Staff;

const SESSION_COOKIE_NAME = "rk-session";

/**
 * Authenticate user with email and password
 * Returns user if credentials are valid, null otherwise
 */
export async function authenticate(
  email: string,
  password: string
): Promise<AuthUser | null> {
  // Find matching auth info
  const authInfo = mockAuth.find(
    (auth) => auth.email.toLowerCase() === email.toLowerCase()
  );

  if (!authInfo || authInfo.password !== password) {
    return null;
  }

  // Find corresponding user (customer or staff)
  if (authInfo.type === "customer") {
    const customer = mockCustomers.find((c) => c.id === authInfo.userId);
    return customer || null;
  } else {
    const staff = mockStaff.find((s) => s.id === authInfo.userId);
    return staff || null;
  }
}

/**
 * Create session cookie (Server Action or Route Handler)
 */
export async function createSession(user: AuthUser): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, JSON.stringify(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
}

/**
 * Delete session cookie (Server Action or Route Handler)
 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Get venue ID for staff user
 */
export function getVenueIdFromUser(user: AuthUser | null): string | null {
  if (user?.type === "staff") {
    return user.venueId;
  }
  return null;
}

/**
 * Get current user from session cookie (Server Component)
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  // Parse session data
  try {
    const userData = JSON.parse(sessionId) as AuthUser;

    // Verify user still exists in mock data
    if (userData.type === "customer") {
      return mockCustomers.find((c) => c.id === userData.id) || null;
    } else {
      return mockStaff.find((s) => s.id === userData.id) || null;
    }
  } catch {
    return null;
  }
}

/**
 * Get current user from request cookies (Middleware version)
 * Uses request.cookies instead of cookies() from next/headers
 */
export function getCurrentUserFromRequest(
  request: NextRequest
): AuthUser | null {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  // Parse session data
  try {
    const userData = JSON.parse(sessionId) as AuthUser;

    // Verify user still exists in mock data
    if (userData.type === "customer") {
      return mockCustomers.find((c) => c.id === userData.id) || null;
    } else {
      return mockStaff.find((s) => s.id === userData.id) || null;
    }
  } catch {
    return null;
  }
}
