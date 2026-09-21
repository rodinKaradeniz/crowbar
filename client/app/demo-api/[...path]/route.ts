import { NextRequest, NextResponse } from "next/server";

import { handleDemoRequest } from "@/lib/demo/handler";
import { IS_DEMO } from "@/lib/demo/mode";

/**
 * The mock API over HTTP. Demo builds point `API_INTERNAL_URL` and
 * `NEXT_PUBLIC_API_URL` at `<origin>/demo-api`, so every existing path to the
 * backend — the `/api/backend` rewrite, the `/api/proxy` route, server
 * components, `ml-api.ts` — reaches this handler without changing a call site.
 *
 * Outside `/api` on purpose: `proxy.ts` rejects origin-less writes under `/api`,
 * and a server-side fetch carries no Origin, so a mock there would answer the
 * sign-in route's own requests with 403.
 *
 * In any build without the demo flag this route does not exist.
 */
async function respond(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!IS_DEMO) {
    return new NextResponse(null, { status: 404 });
  }

  const { path } = await params;
  const result = handleDemoRequest({
    method: request.method,
    path: `/${path.map(encodeURIComponent).join("/")}`,
    query: request.nextUrl.searchParams,
    authorization: request.headers.get("authorization"),
  });

  if ((result.body as { code?: string } | null)?.code === "DEMO_NOT_RECORDED") {
    // What a missing fixture looks like from the outside. Re-record to fix.
    console.warn(`[demo-api] not recorded: ${request.method} /${path.join("/")}${request.nextUrl.search}`);
  }

  if (result.status === 204 || request.method === "HEAD") {
    return new NextResponse(null, { status: result.status });
  }
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}

export const GET = respond;
export const HEAD = respond;
export const POST = respond;
export const PATCH = respond;
export const PUT = respond;
export const DELETE = respond;
