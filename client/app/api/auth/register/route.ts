import { NextRequest, NextResponse } from "next/server";
import { setTokenCookie, serverGetMe } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userType } = body;

    if (!userType) {
      return NextResponse.json(
        { error: "User type is required" },
        { status: 400 }
      );
    }

    // Determine which backend endpoint to call
    const endpoint =
      userType === "business"
        ? "/api/auth/register-business"
        : "/api/auth/register";

    // Build the payload for the backend
    let payload: Record<string, unknown>;

    if (userType === "business") {
      payload = {
        email: body.email,
        password: body.password,
        name: body.name,
        phone: body.phone,
        business_name: body.businessName,
        business_slug: body.businessSlug,
        business_address: body.businessAddress || null,
        business_description: body.businessDescription || null,
      };
    } else {
      payload = {
        email: body.email,
        password: body.password,
        name: body.name,
        phone: body.phone || null,
        user_type: "customer",
      };
    }

    // Call FastAPI registration endpoint
    const backendResponse = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!backendResponse.ok) {
      const errorBody = await backendResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorBody.detail || "Registration failed" },
        { status: backendResponse.status }
      );
    }

    const loginResponse = await backendResponse.json();

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
          role: user.role || "owner",
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      { ...baseUser, type: "customer" },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
