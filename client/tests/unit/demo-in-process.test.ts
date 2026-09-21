import { afterEach, describe, expect, it, vi } from "vitest";

import { mintDemoToken } from "@/lib/demo/token";

/**
 * A self-contained demo build must answer backend calls in its own process.
 * These load `lib/backend-fetch` fresh under each environment, because it
 * reads the build flag once at module load — exactly as a build does.
 */
async function loadBackendFetch() {
  vi.resetModules();
  return import("@/lib/backend-fetch");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("backendFetch in a self-contained demo build", () => {
  it("answers from the mock without touching the network", async () => {
    vi.stubEnv("NEXT_PUBLIC_CROWBAR_DEMO", "true");
    vi.stubEnv("API_INTERNAL_URL", "");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const fetchSpy = vi.fn(() => {
      throw new Error("a self-contained demo must not open a connection");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { backendFetch, IS_SELF_CONTAINED_DEMO } = await loadBackendFetch();
    expect(IS_SELF_CONTAINED_DEMO).toBe(true);

    const response = await backendFetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${mintDemoToken("owner")}` },
    });
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(await response.json()).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a write outside the service loop, over either transport", async () => {
    vi.stubEnv("NEXT_PUBLIC_CROWBAR_DEMO", "true");
    vi.stubEnv("API_INTERNAL_URL", "");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const { backendFetch } = await loadBackendFetch();

    const response = await backendFetch("/api/businesses/current", {
      method: "PATCH",
      body: JSON.stringify({ name: "Somewhere Else" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "DEMO_NOT_SAVED" });
  });

  it("still goes over the network for a real backend", async () => {
    vi.stubEnv("NEXT_PUBLIC_CROWBAR_DEMO", "");
    vi.stubEnv("API_INTERNAL_URL", "http://api.internal:8000");
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { backendFetch, IS_SELF_CONTAINED_DEMO } = await loadBackendFetch();
    expect(IS_SELF_CONTAINED_DEMO).toBe(false);

    await backendFetch("/api/auth/me", { headers: {} });
    expect(fetchSpy).toHaveBeenCalledWith("http://api.internal:8000/api/auth/me", expect.anything());
  });
});
