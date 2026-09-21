import { NextRequest, NextResponse } from "next/server";

import { IS_DEMO } from "@/lib/demo/mode";
import { clearDemoOps } from "@/lib/demo/session";
import { safeSameOriginRedirect } from "@/lib/request-security";

/**
 * Start the evening again.
 *
 * The demo keeps what a visitor does in one cookie, which is small enough to
 * fill. Rather than quietly dropping the oldest thing they did, the demo says
 * it is full and offers this: forget everything, and the recorded evening is
 * back as it was recorded. It is also the way out of any state a visitor has
 * got themselves into, which a demo needs and a real venue does not.
 *
 * `proxy.ts` has already rejected a cross-site post before this runs. In any
 * build without the demo flag the route does not exist.
 */
export async function POST(request: NextRequest) {
  if (!IS_DEMO) {
    return new NextResponse(null, { status: 404 });
  }

  await clearDemoOps();

  const origin = request.nextUrl.origin;
  const referer = request.headers.get("referer");
  const back = referer ? safeSameOriginRedirect(referer, origin) : null;
  return NextResponse.redirect(back ?? new URL("/business", origin), 303);
}
