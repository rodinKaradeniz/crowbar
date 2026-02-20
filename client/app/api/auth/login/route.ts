import { NextRequest, NextResponse } from "next/server";
import { serverLogin, setTokenCookie, serverGetMe } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const loginResponse = await serverLogin(email, password);

    // Store the JWT token in an httpOnly cookie
    await setTokenCookie(loginResponse.access_token);

    // Fetch the full user profile (including staff business info)
    const user = await serverGetMe();

    if (!user) {
      return NextResponse.json(
        { error: "Failed to fetch user profile" },
        { status: 500 }
      );
    }

    // Build response matching the frontend's AuthUser shape
    const baseUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      avatar: user.avatar,
      createdAt: user.created_at,
    };

    if (user.user_type === "staff" && user.business_id) {
      return NextResponse.json(
        {
          ...baseUser,
          type: "staff",
          businessId: user.business_id,
          role: user.role || "staff",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { ...baseUser, type: "customer" },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
