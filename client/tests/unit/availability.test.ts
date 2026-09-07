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

describe("groupSlotRuns", () => {
  const at = (iso: string) => ({ startsAt: iso });

  it("splits the after-midnight run off the evening run", async () => {
    // The server deliberately walks one service date back so an overnight
    // window contributes its small hours to the requested date. Ascending order
    // is correct and puts 00:00 first, which reads as "opens at midnight" until
    // the two runs are named apart.
    const { groupSlotRuns } = await import(
      "@/app/reserve/manage/[token]/manage-reservation-client"
    );

    const runs = groupSlotRuns(
      [
        at("2026-09-15T00:00:00Z"),
        at("2026-09-15T00:30:00Z"),
        at("2026-09-15T01:00:00Z"),
        at("2026-09-15T17:00:00Z"),
        at("2026-09-15T17:30:00Z"),
      ],
      30,
    );

    expect(runs).toHaveLength(2);
    expect(runs[0]).toHaveLength(3);
    expect(runs[1]).toHaveLength(2);
  });

  it("leaves a contiguous day as one run, so nothing is labelled", async () => {
    const { groupSlotRuns } = await import(
      "@/app/reserve/manage/[token]/manage-reservation-client"
    );

    const runs = groupSlotRuns(
      [
        at("2026-09-15T17:00:00Z"),
        at("2026-09-15T17:30:00Z"),
        at("2026-09-15T18:00:00Z"),
      ],
      30,
    );

    expect(runs).toHaveLength(1);
  });

  it("handles an empty list and a single slot", async () => {
    const { groupSlotRuns } = await import(
      "@/app/reserve/manage/[token]/manage-reservation-client"
    );

    expect(groupSlotRuns([], 30)).toEqual([]);
    expect(groupSlotRuns([at("2026-09-15T17:00:00Z")], 30)).toHaveLength(1);
  });

  it("follows the venue's own interval rather than a fixed one", async () => {
    // At 15-minute intervals a 30-minute step is already a gap. The split has
    // to read the interval off the payload, not assume the demo's 30.
    const { groupSlotRuns } = await import(
      "@/app/reserve/manage/[token]/manage-reservation-client"
    );

    const slots = [at("2026-09-15T17:00:00Z"), at("2026-09-15T17:30:00Z")];

    expect(groupSlotRuns(slots, 15)).toHaveLength(2);
    expect(groupSlotRuns(slots, 30)).toHaveLength(1);
  });
});
