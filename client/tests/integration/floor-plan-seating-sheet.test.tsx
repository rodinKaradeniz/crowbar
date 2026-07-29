import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FloorPlanSeatingSheet } from "@/components/floor-plan-seating-sheet";
import type { FloorPlanBoardTable, FloorPlanParty } from "@/types";

const party: FloorPlanParty = {
  sourceType: "queue",
  sourceId: "queue-1",
  name: "Taylor",
  partySize: 4,
  status: "waiting",
  assignedTableIds: [],
};

function table(id: string, label: string, capacity: number): FloorPlanBoardTable {
  return {
    id,
    areaId: "area-1",
    label,
    capacity,
    shape: "square",
    sortOrder: 0,
    displayState: "available",
    operationalState: "ready",
    operationalStateExpired: false,
  };
}

describe("FloorPlanSeatingSheet", () => {
  it("requires an owner or manager reason before submitting a capacity override", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <FloorPlanSeatingSheet
        open
        onOpenChange={vi.fn()}
        party={party}
        tables={[table("t1", "T1", 2)]}
        canOverride
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: /T1/i }));
    const confirm = screen.getByRole("button", { name: "Seat party" });
    expect(confirm).toBeDisabled();

    await user.type(
      screen.getByLabelText(/Owner or manager reason/i),
      "Guest requested a compact arrangement",
    );
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith(
      ["t1"],
      "Guest requested a compact arrangement",
    );
  }, 10_000);

  it("does not allow ordinary staff to submit an undersized table", async () => {
    const user = userEvent.setup();
    render(
      <FloorPlanSeatingSheet
        open
        onOpenChange={vi.fn()}
        party={party}
        tables={[table("t1", "T1", 2)]}
        canOverride={false}
        onConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /T1/i }));
    expect(screen.getByRole("button", { name: "Seat party" })).toBeDisabled();
    expect(screen.getByText(/Ask an owner or manager/i)).toBeInTheDocument();
  });

  it("allows future table planning on a table occupied right now", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <FloorPlanSeatingSheet
        open
        onOpenChange={vi.fn()}
        party={party}
        mode="assign"
        tables={[{ ...table("t1", "T1", 4), displayState: "occupied", activeSeating: { seatingId: "seat-1", source: party, openedAt: "2026-01-01T12:00:00Z" } }]}
        canOverride={false}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: /T1/i }));
    await user.click(screen.getByRole("button", { name: "Assign tables" }));
    expect(onConfirm).toHaveBeenCalledWith(["t1"], undefined);
  });
});
