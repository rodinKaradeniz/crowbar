import { NextRequest, NextResponse } from "next/server";
import { setTokenCookie, serverGetMe } from "@/lib/api";

const API_BASE =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const { token, name, password } = await request.json();

    if (!token || !name || !password) {
      return NextResponse.json(
        { error: "token, name, and password are required" },
        { status: 400 }
      );
    }

    const backendResponse = await fetch(
      `${API_BASE}/api/staff/invite/${token}/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      }
    );

    if (!backendResponse.ok) {
      const errorBody = await backendResponse.json().catch(() => ({}));
      const msg =
        errorBody?.message || errorBody?.detail || "Failed to accept invitation";
      return NextResponse.json({ error: msg, code: errorBody?.code }, { status: backendResponse.status });
    }

    const loginResponse = await backendResponse.json();

    await setTokenCookie(loginResponse.access_token);

    const user = await serverGetMe();
    if (!user) {
      return NextResponse.json({ error: "Failed to fetch user profile" }, { status: 500 });
    }

    return NextResponse.json(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        type: "staff",
        businessId: user.business_id,
        role: user.role || "staff",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Accept invite error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
