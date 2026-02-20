import { NextResponse } from "next/server";
import { serverGetMe } from "@/lib/api";

export async function GET() {
  try {
    const user = await serverGetMe();

    if (!user) {
      return NextResponse.json(null, { status: 200 });
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
  } catch (error) {
    console.error("Session error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
