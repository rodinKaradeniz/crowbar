import { describe, expect, it } from "vitest";

import { isTrustedMutationRequest, safeSameOriginRedirect } from "@/lib/request-security";

describe("authenticated proxy request security", () => {
  it("accepts same-origin browser mutations", () => {
    expect(
      isTrustedMutationRequest({
        method: "POST",
        requestOrigin: "https://crowbar.example",
        originHeader: "https://crowbar.example",
        fetchSite: "same-origin",
      }),
    ).toBe(true);
  });

  it("rejects cross-origin and originless mutations", () => {
    expect(
      isTrustedMutationRequest({
        method: "DELETE",
        requestOrigin: "https://crowbar.example",
        originHeader: "https://attacker.example",
        fetchSite: "cross-site",
      }),
    ).toBe(false);
    expect(
      isTrustedMutationRequest({
        method: "PATCH",
        requestOrigin: "https://crowbar.example",
        originHeader: null,
        fetchSite: null,
      }),
    ).toBe(false);
  });

  it("allows reads without an origin and rejects external redirects", () => {
    expect(
      isTrustedMutationRequest({
        method: "GET",
        requestOrigin: "https://crowbar.example",
        originHeader: null,
        fetchSite: null,
      }),
    ).toBe(true);
    expect(
      safeSameOriginRedirect("/auth/login", "https://crowbar.example"),
    ).toBe("https://crowbar.example/auth/login");
    expect(
      safeSameOriginRedirect("https://attacker.example/phish", "https://crowbar.example"),
    ).toBeNull();
  });
});
