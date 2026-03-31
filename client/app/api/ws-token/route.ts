import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const TOKEN_COOKIE_NAME = "rk-token";

/**
 * Returns the JWT stored in the httpOnly cookie so client-side code
 * can use it for WebSocket authentication (which can't use the proxy route).
 * Only exposes the token — does not validate it here (FastAPI validates on WS connect).
 */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({ token });
}
