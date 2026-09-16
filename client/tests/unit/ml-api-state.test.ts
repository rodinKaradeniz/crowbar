import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/handlers";

// `mlFetch` reads the staff JWT from a server-side cookie. The states under
// test are decided entirely by the RESPONSE, so the token is stubbed and the
// responses are what vary.
vi.mock("@/lib/api", () => ({ getToken: async () => "test-token" }));

import { fetchMLDemandForecast, fetchMLStatus } from "@/lib/ml-api";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const DEMAND = "http://localhost:8000/api/insights/demand";
const STATUS = "http://localhost:8000/api/insights/status";

/**
 * The whole point of `MLResult`: these five answers used to be one `null`, and
 * the page rendered "Crowbar needs a few weeks of your own service history"
 * for every one of them. Three of the five make that sentence a lie.
 */
describe("mlFetch distinguishes why an insight is missing", () => {
  it("reports a disabled module rather than missing data", async () => {
    server.use(
      http.get(DEMAND, () =>
        HttpResponse.json(
          { code: "MODULE_DISABLED", message: "Module not enabled", details: { module: "insights" } },
          { status: 403 },
        ),
      ),
    );
    const result = await fetchMLDemandForecast();
    expect(result.state).toBe("module-disabled");
    expect(result.data).toBeNull();
  });

  it("reports a live figure as live, with no captured-at", async () => {
    server.use(
      http.get(DEMAND, () =>
        HttpResponse.json({ status: "success", forecasts: {}, stale: false }),
      ),
    );
    const result = await fetchMLDemandForecast();
    expect(result.state).toBe("live");
    expect(result.capturedAt).toBeNull();
    expect(result.data?.status).toBe("success");
  });

  it("reports a remembered figure with the time it was captured", async () => {
    server.use(
      http.get(DEMAND, () =>
        HttpResponse.json({
          status: "success",
          forecasts: {},
          stale: true,
          captured_at: "2026-09-09T06:53:51+00:00",
          unavailable_reason: "The insights service is unreachable. These are the last results it produced.",
        }),
      ),
    );
    const result = await fetchMLDemandForecast();
    expect(result.state).toBe("remembered");
    expect(result.capturedAt).toBe("2026-09-09T06:53:51+00:00");
    expect(result.unavailableReason).toContain("unreachable");
    // Still carries the payload: a remembered number is shown, not withheld.
    expect(result.data?.status).toBe("success");
  });

  it("separates 'service away, never produced a result' from 'nothing has run'", async () => {
    server.use(
      http.get(STATUS, () =>
        HttpResponse.json({
          status: "unavailable",
          stale: true,
          captured_at: null,
          unavailable_reason:
            "The insights service is unreachable and has produced no results for this venue yet.",
          resource: "status",
        }),
      ),
    );
    const result = await fetchMLStatus();
    expect(result.state).toBe("unreachable");
    expect(result.capturedAt).toBeNull();
    expect(result.unavailableReason).toContain("unreachable");
  });

  it("reports a reachable service with no result for this model, and keeps its reason", async () => {
    // The gateway answers 404 here while labelling the body INTERNAL_ERROR.
    // The STATUS is the honest half, which is what mlFetch branches on.
    server.use(
      http.get(DEMAND, () =>
        HttpResponse.json(
          {
            code: "INTERNAL_ERROR",
            message:
              "Demand forecast not available: 9 day(s) of usable history; at least 14 are needed to forecast.",
            details: null,
          },
          { status: 404 },
        ),
      ),
    );
    const result = await fetchMLDemandForecast();
    expect(result.state).toBe("no-result");
    expect(result.unavailableReason).toContain("14 are needed");
  });

  it("degrades quietly when the service cannot be reached at all", async () => {
    server.use(http.get(DEMAND, () => HttpResponse.error()));
    const result = await fetchMLDemandForecast();
    expect(result.state).toBe("error");
    expect(result.data).toBeNull();
  });
});
