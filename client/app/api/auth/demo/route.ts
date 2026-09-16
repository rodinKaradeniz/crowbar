import { NextRequest, NextResponse } from "next/server";

import { setTokenCookie } from "@/lib/api";
import { IS_DEMO } from "@/lib/demo/mode";
import { isDemoRole, mintDemoToken } from "@/lib/demo/token";

/**
 * One-click entry to the demo. A form on the sign-in page posts the chosen
 * role; this sets the ordinary `rk-token` cookie to an unsigned demo token and
 * sends the visitor to the workspace. No password exists to share or leak.
 *
 * `proxy.ts` has already rejected a cross-site post before this runs. In any
 * build without the demo flag the route does not exist.
 */
export async function POST(request: NextRequest) {
  if (!IS_DEMO) {
    return new NextResponse(null, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const role = form?.get("role");
  if (!isDemoRole(role)) {
    return NextResponse.json(
      { error: "Choose a role to enter the demo." },
      { status: 400 },
    );
  }

  await setTokenCookie(mintDemoToken(role));
  return NextResponse.redirect(new URL("/business", request.nextUrl.origin), 303);
}
