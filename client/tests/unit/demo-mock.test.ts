import { describe, expect, it } from "vitest";

import { findFixtureViolations } from "@/lib/demo/fixture-rules.mjs";
import recording from "@/lib/demo/fixtures/recording.json";
import { handleDemoRequest } from "@/lib/demo/handler";
import { requestKey } from "@/lib/demo/recording";
import { dayOffset, shiftJson, shiftValue } from "@/lib/demo/time-shift";
import { mintDemoToken, readDemoRole } from "@/lib/demo/token";

describe("demo token", () => {
  it("decodes with atob the way proxy.ts does", () => {
    const token = mintDemoToken("host_server", 1_800_000_000);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    const payload = JSON.parse(atob(parts[1]));
    expect(payload).toMatchObject({
      user_type: "staff",
      sub: "00000000-0000-0000-0002-000000000012",
      aud: "crowbar-demo",
      token_use: "demo",
    });
  });

  it("is never signed", () => {
    expect(mintDemoToken("owner").endsWith(".")).toBe(true);
    expect(JSON.parse(atob(mintDemoToken("owner").split(".")[0])).alg).toBe("none");
  });

  it("reads back only its own, unexpired tokens", () => {
    const now = 1_800_000_000;
    const token = mintDemoToken("bar_kitchen", now);
    expect(readDemoRole(`Bearer ${token}`, now * 1000)).toBe("bar_kitchen");
    expect(readDemoRole(`Bearer ${token}`, (now + 9 * 3600) * 1000)).toBeNull();
    expect(readDemoRole(`Bearer ${token}signature`, now * 1000)).toBeNull();
    expect(readDemoRole(null)).toBeNull();
    const forgedRole = token.split(".");
    forgedRole[1] = btoa(JSON.stringify({ ...JSON.parse(atob(forgedRole[1])), role: "manager" }));
    expect(readDemoRole(`Bearer ${forgedRole.join(".")}`, now * 1000)).toBeNull();
  });
});

describe("demo time shift", () => {
  it("counts service days in Berlin with a 04:00 rollover", () => {
    // 01:30 Berlin on the 17th is still the evening of the 16th.
    expect(dayOffset("2026-09-16T18:00:00Z", Date.parse("2026-09-16T23:30:00Z"))).toBe(0);
    expect(dayOffset("2026-09-16T18:00:00Z", Date.parse("2026-09-17T03:00:00Z"))).toBe(1);
    expect(dayOffset("2026-09-16T18:00:00Z", Date.parse("2026-09-23T18:00:00Z"))).toBe(7);
  });

  it("moves plain dates and naive date-times by whole days", () => {
    expect(shiftValue("2026-09-16", 3)).toBe("2026-09-19");
    expect(shiftValue("2026-12-30", 3)).toBe("2027-01-02");
    expect(shiftValue("2026-09-16T20:00:00", -1)).toBe("2026-09-15T20:00:00");
  });

  it("keeps Berlin wall-clock time across a DST change", () => {
    // 20:00 CEST on 2026-10-24 is 18:00Z; a week later it is 20:00 CET, 19:00Z.
    expect(shiftValue("2026-10-24T18:00:00Z", 7)).toBe("2026-10-31T19:00:00Z");
    expect(shiftValue("2026-10-24T20:00:00+02:00", 7)).toBe("2026-10-31T21:00:00+02:00");
    expect(shiftValue("2026-10-24T18:00:00.123456+00:00", 7)).toBe("2026-10-31T19:00:00.123456+00:00");
  });

  it("round-trips a request date back to the recorded one", () => {
    expect(shiftValue(shiftValue("2026-09-16T19:15:00Z", 40), -40)).toBe("2026-09-16T19:15:00Z");
  });

  it("leaves everything that is not a date alone", () => {
    const value = { id: "00000000-0000-0000-0002-000000000010", time: "19:00", n: 2, v: "2026-9-1" };
    expect(shiftJson(value, 5)).toEqual(value);
  });
});

describe("demo mock handler", () => {
  it("never saves a write", () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      const result = handleDemoRequest({
        method,
        path: "/api/ordering/x/orders",
        query: new URLSearchParams(),
        authorization: `Bearer ${mintDemoToken("owner")}`,
      });
      expect(result.status).toBe(409);
      expect(result.body).toMatchObject({ code: "DEMO_NOT_SAVED" });
    }
  });

  it("answers an unrecorded read as not in the demo", () => {
    const result = handleDemoRequest({
      method: "GET",
      path: "/api/does-not-exist",
      query: new URLSearchParams(),
      authorization: null,
    });
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ code: "DEMO_NOT_RECORDED" });
  });

  it("answers insights honestly, and only for roles that may see them", () => {
    const ask = (role: "owner" | "bar_kitchen") =>
      handleDemoRequest({
        method: "GET",
        path: "/api/insights/demand",
        query: new URLSearchParams(),
        authorization: `Bearer ${mintDemoToken(role)}`,
      });
    expect(ask("owner")).toMatchObject({
      status: 200,
      body: { status: "unavailable", stale: true, captured_at: null },
    });
    expect(ask("bar_kitchen").status).toBe(403);
  });

  it("keys requests independently of query order", () => {
    expect(requestKey("get", "/api/x", new URLSearchParams("b=2&a=1"))).toBe(
      requestKey("GET", "/api/x", new URLSearchParams("a=1&b=2")),
    );
  });
});

describe("demo fixtures", () => {
  it("contain only fictional people and non-fiscal copy", () => {
    expect(findFixtureViolations(recording)).toEqual([]);
  });

  it("the rules catch what they claim to", () => {
    expect(findFixtureViolations({ email: "someone@gmail.com" })).toHaveLength(1);
    expect(findFixtureViolations({ phone: "+4930123456789" })).toHaveLength(1);
    expect(findFixtureViolations({ phone: "+12025550101", email: "owner@example.com" })).toEqual([]);
    expect(findFixtureViolations({ label: "Paid" })).toHaveLength(1);
    expect(findFixtureViolations({ total_revenue: 1 })).toHaveLength(1);
    expect(findFixtureViolations({ note: ["pass", "word", "123"].join("") })).toHaveLength(1);
  });
});
