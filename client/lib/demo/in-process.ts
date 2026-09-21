import { handleDemoRequest } from "./handler";

/**
 * The mock as a `Response`, with no network in between.
 *
 * `handleDemoRequest` is pure; this adapts it to what `fetch` callers expect,
 * so every existing status, error and body path behaves the same. The HTTP
 * route at `app/demo-api/[...path]` is the same handler with a real request in
 * front of it, for a browser call or a remote demo.
 */
export async function demoResponse(path: string, init?: RequestInit): Promise<Response> {
  const [pathname, search = ""] = path.split("?");
  const headers = new Headers(init?.headers);

  const result = handleDemoRequest({
    method: init?.method ?? "GET",
    path: pathname,
    query: new URLSearchParams(search),
    authorization: headers.get("authorization"),
  });

  if (result.status === 204) {
    return new Response(null, { status: 204 });
  }
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}
