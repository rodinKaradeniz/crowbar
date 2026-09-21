import { handleDemoRequest } from "./handler";
import { readDemoOps, writeDemoOps } from "./session";

/**
 * The mock as a `Response`, with no network in between.
 *
 * `handleDemoRequest` is pure; this adapts it to what `fetch` callers expect,
 * so every existing status, error and body path behaves the same, and it
 * carries the visitor's op log in and out of their cookie. The HTTP route at
 * `app/demo-api/[...path]` is the same handler with a real request in front of
 * it, for a browser call or a remote demo.
 */
export async function demoResponse(path: string, init?: RequestInit): Promise<Response> {
  const [pathname, search = ""] = path.split("?");
  const headers = new Headers(init?.headers);
  const method = init?.method ?? "GET";
  const raw = typeof init?.body === "string" ? init.body : undefined;

  const result = handleDemoRequest({
    method,
    path: pathname,
    query: new URLSearchParams(search),
    authorization: headers.get("authorization"),
    body: raw ? safeJson(raw) : undefined,
    ops: await readDemoOps(),
  });

  if (result.ops) await writeDemoOps(result.ops);

  if (result.status === 204) {
    return new Response(null, { status: 204 });
  }
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
