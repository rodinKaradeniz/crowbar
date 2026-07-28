import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const TOKEN_COOKIE_NAME = "rk-token";
const BACKEND_URL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

/**
 * Exchanges the httpOnly session JWT server-side for a short-lived,
 * business-bound WebSocket credential. The primary JWT never reaches browser
 * JavaScript.
 */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const response = await fetch(`${BACKEND_URL}/api/auth/ws-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
