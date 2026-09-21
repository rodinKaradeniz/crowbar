import { NextRequest, NextResponse } from "next/server";

import { handleDemoRequest } from "@/lib/demo/handler";
import { IS_DEMO } from "@/lib/demo/mode";
import { readDemoOps, writeDemoOps } from "@/lib/demo/session";

/**
 * The mock API over HTTP.
 *
 * A self-contained demo answers in process and never comes here (see
 * `lib/backend-fetch.ts`); this is the front door for the browser's own public
 * reads, which `next.config.ts` rewrites onto it, and for a demo deployed with
 * its mock at a URL.
 *
 * Outside `/api` on purpose: `proxy.ts` rejects origin-less writes under
 * `/api`, and a server-side fetch carries no Origin, so a mock there would
 * answer the sign-in route's own requests with 403.
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
  const raw = await request.text().catch(() => "");
  const result = handleDemoRequest({
    method: request.method,
    path: `/${path.map(encodeURIComponent).join("/")}`,
    query: request.nextUrl.searchParams,
    authorization: request.headers.get("authorization"),
    body: raw ? safeJson(raw) : undefined,
    ops: await readDemoOps(),
  });

  if (result.ops) await writeDemoOps(result.ops);

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

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export const GET = respond;
export const HEAD = respond;
export const POST = respond;
export const PATCH = respond;
export const PUT = respond;
export const DELETE = respond;
