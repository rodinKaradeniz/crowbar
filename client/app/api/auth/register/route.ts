import { NextRequest, NextResponse } from "next/server";
import { setTokenCookie, serverGetMe } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

const API_BASE =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = {
      email: body.email,
      password: body.password,
      name: body.name,
      phone: body.phone,
      business_name: body.businessName,
      business_slug: body.businessSlug,
      business_address: body.businessAddress || null,
      business_description: body.businessDescription || null,
      country_code: body.countryCode,
      currency_code: body.currencyCode,
      locale: body.locale,
      timezone: body.timezone,
      tax_label: body.taxLabel,
    };

    // Call FastAPI registration endpoint
    const backendResponse = await fetch(`${API_BASE}/api/auth/register-business`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!backendResponse.ok) {
      const errorBody = await backendResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: typeof errorBody.detail === "string" ? errorBody.detail : "Registration failed" },
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

    if (user.user_type !== "staff" || !user.business_id) {
      return NextResponse.json({ error: "Staff account creation failed" }, { status: 500 });
    }
    return NextResponse.json(
      { ...baseUser, type: "staff", businessId: user.business_id, role: user.role || "owner" },
      { status: 201 },
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
