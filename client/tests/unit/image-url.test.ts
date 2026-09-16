import { describe, expect, it } from "vitest";

import { renderableImageSrc } from "@/lib/image-url";

/**
 * The predicate that keeps an operator-pasted URL out of an `src` attribute.
 * It mirrors `server/app/core/image_url.validate_image_url`; if these two ever
 * disagree, the guest page is the one that pays.
 */
describe("renderableImageSrc", () => {
  it("accepts an https URL", () => {
    expect(renderableImageSrc("https://images.example.test/venue.jpg")).toBe(
      "https://images.example.test/venue.jpg",
    );
  });

  it("accepts a path this app serves itself", () => {
    expect(renderableImageSrc("/venue.jpg")).toBe("/venue.jpg");
  });

  it("trims a pasted value rather than refusing it", () => {
    expect(renderableImageSrc("  https://images.example.test/venue.jpg\n")).toBe(
      "https://images.example.test/venue.jpg",
    );
  });

  it.each([
    ["http, which the venue's privacy rule already refuses", "http://images.example.test/venue.jpg"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:image/svg+xml,<svg onload=alert(1)/>"],
    ["a protocol-relative URL", "//images.example.test/venue.jpg"],
    ["a bare string", "images.example.test/venue.jpg"],
    ["nonsense", "not a url at all"],
  ])("refuses %s", (_label, value) => {
    expect(renderableImageSrc(value)).toBeNull();
  });

  it.each([
    ["an empty string", ""],
    ["whitespace only", "   "],
    ["null", null],
    ["undefined", undefined],
  ])("treats %s as no image", (_label, value) => {
    expect(renderableImageSrc(value)).toBeNull();
  });
});
