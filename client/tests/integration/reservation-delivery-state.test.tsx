import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReservationTable } from "@/components/reservation-table";
import type { Reservation } from "@/types";

/**
 * A guest who was never told must be visible while SCANNING the book, not only
 * after opening a booking. That marker is the read half of the delivery fix;
 * without it the row is recorded and unseen, which is where this started.
 */

const BASE: Reservation = {
  id: "res-1",
  businessId: "biz-1",
  customerId: "cus-1",
  serviceTypeId: "svc-1",
  // Well in the future, so nothing here is late.
  time: "2099-02-01T18:00:00Z",
  endsAt: "2099-02-01T20:00:00Z",
  phone: "+4915112345678",
  email: "guest@example.com",
  status: "confirmed",
  guests: 2,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function renderBoard(reservation: Reservation) {
  return render(
    <ReservationTable
      reservations={[reservation]}
      customers={[
        {
          id: "cus-1",
          business_id: "biz-1",
          name: "Anna Vogel",
          created_at: "2026-01-01T00:00:00Z",
        } as never,
      ]}
      serviceTypes={[]}
      businessTimezone="Europe/Berlin"
      now={Date.parse("2026-02-01T12:00:00Z")}
    />,
  );
}

describe("reservation delivery state on the board", () => {
  it("marks a booking whose confirmation failed", () => {
    renderBoard({ ...BASE, deliveryState: "failed" });
    expect(screen.getByText("Message failed")).toBeInTheDocument();
  });

  it.each(["delivered", "pending", "unavailable", undefined])(
    "says nothing when the state is %s",
    (state) => {
      renderBoard({ ...BASE, deliveryState: state });
      expect(screen.queryByText("Message failed")).not.toBeInTheDocument();
    },
  );

  it("does not call a punctual booking late because its email failed", () => {
    // Two attend inputs share the row. The row tint takes the worse of them,
    // but the Status column is about lateness alone — labelling this "Late"
    // would be a false operational claim.
    renderBoard({ ...BASE, deliveryState: "failed" });
    expect(screen.getByText("Message failed")).toBeInTheDocument();
    expect(screen.queryByText("Late")).not.toBeInTheDocument();
    expect(screen.getByText("confirmed")).toBeInTheDocument();
  });
});
