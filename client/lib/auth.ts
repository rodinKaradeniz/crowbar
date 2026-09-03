import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { Customer, Staff } from "@/types";
import { apiGetMe } from "@/lib/api-client";

export type AuthUser = Customer | Staff;

const TOKEN_COOKIE_NAME = "rk-token";

/**
 * Get current user from session (Server Component)
 * Calls the FastAPI /auth/me endpoint with the stored JWT token
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  try {
    const user = await apiGetMe(token);

    const baseUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone || undefined,
      avatar: user.avatar || undefined,
      createdAt: user.created_at,
      deletionRequestedAt: user.deletion_requested_at || undefined,
    };

    if (user.user_type === "staff" && user.business_id) {
      return {
        ...baseUser,
        type: "staff" as const,
        businessId: user.business_id,
        role: (user.role || "staff") as Staff["role"],
      };
    }

    return {
      ...baseUser,
      type: "customer" as const,
    };
  } catch {
    return null;
  }
}

/**
 * Get business ID for staff user
 */
export function getBusinessIdFromUser(user: AuthUser | null): string | null {
  if (user?.type === "staff") {
    return user.businessId;
  }
  return null;
}

/**
 * Get current user from request cookies (Middleware version)
 * Note: In middleware we can't make async API calls reliably,
 * so we decode the JWT locally to check if the user is authenticated.
 * We do a lightweight check — just verify the token exists and has valid structure.
 */
export function getCurrentUserFromRequest(
  request: NextRequest
): { type: string; userId: string } | null {
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  try {
    // Decode the JWT payload (without verification — FastAPI handles that)
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));

    // Check expiration
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
