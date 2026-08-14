import { describe, expect, it } from "vitest";

import {
  formatBusinessDate,
  formatBusinessDateTime,
  formatBusinessTime,
} from "@/lib/business-time";
import { formatMoney, toMoney, toOptionalMoney } from "@/lib/money";

describe("MVP money boundary", () => {
  it("normalizes API values and formats EUR with the German locale", () => {
    expect(toMoney("12.5")).toBe(12.5);
    expect(toMoney("not-a-number")).toBe(0);
    expect(toOptionalMoney(null)).toBeUndefined();
    expect(formatMoney("12.5")).toMatch(/^12,50\s€/);
  });
});

describe("business timezone formatting", () => {
  const instant = "2026-01-01T23:30:00Z";

  it("uses the venue timezone rather than the browser timezone", () => {
    expect(formatBusinessTime(instant, "Europe/Berlin")).toBe("00:30");
    expect(formatBusinessDate(instant, "Europe/Berlin")).toContain("2026");
    expect(formatBusinessDateTime(instant, "Europe/Berlin")).not.toBe(
      formatBusinessDateTime(instant, "UTC"),
    );
  });
});
