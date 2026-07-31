import { describe, expect, it } from "vitest";
import { venueLocalDateTimeToIso } from "@/lib/availability";

describe("venueLocalDateTimeToIso", () => {
  it("uses the venue timezone instead of the browser timezone", () => {
    expect(
      venueLocalDateTimeToIso(
        new Date(2026, 6, 31),
        "19:00",
        "Europe/Berlin",
      ),
    ).toBe("2026-07-31T17:00:00.000Z");
  });

  it("rejects a nonexistent local time during a daylight-saving change", () => {
    expect(
      venueLocalDateTimeToIso(
        new Date(2026, 2, 29),
        "02:30",
        "Europe/Berlin",
      ),
    ).toBeNull();
  });
});
