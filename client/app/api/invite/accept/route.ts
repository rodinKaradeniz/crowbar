import { NextRequest, NextResponse } from "next/server";
import { setTokenCookie, serverGetMe } from "@/lib/api";

const API_BASE =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const { name, password } = await request.json();

    if (!name || !password) {
      return NextResponse.json(
        { error: "name and password are required" },
        { status: 400 }
      );
    }

    const backendResponse = await fetch(
      `${API_BASE}/api/staff/invite/accept`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: request.headers.get("cookie") ?? "",
          Origin: request.nextUrl.origin,
          "Sec-Fetch-Site": "same-origin",
        },
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

    const response = NextResponse.json(
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
    const clearedCapabilityCookie = backendResponse.headers.get("set-cookie");
    if (clearedCapabilityCookie) {
      response.headers.append("set-cookie", clearedCapabilityCookie);
    }
    return response;
  } catch (error) {
    console.error("Accept invite error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
