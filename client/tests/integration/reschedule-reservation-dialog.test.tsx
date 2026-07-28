import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RescheduleReservationDialog } from "@/components/reschedule-reservation-dialog";
import type { Reservation, ServiceType } from "@/types";

const apiMocks = vi.hoisted(() => ({
  getAvailability: vi.fn(),
  reschedule: vi.fn(),
}));

vi.mock("@/lib/client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-api")>()),
  clientGetReservationRescheduleAvailability: apiMocks.getAvailability,
  clientRescheduleReservation: apiMocks.reschedule,
}));

const serviceType: ServiceType = {
  id: "service-1",
  businessId: "business-1",
  name: "Table",
  capacity: 6,
  maxConcurrentBookings: 1,
  isPendingEnabled: false,
  duration: 60,
  color: "#a16207",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function tomorrowAt(hour: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + 1);
  value.setUTCHours(hour, 0, 0, 0);
  return value.toISOString();
}

describe("RescheduleReservationDialog", () => {
  beforeEach(() => {
    apiMocks.getAvailability.mockReset();
    apiMocks.reschedule.mockReset();
  });

  it("offers only server-returned slots and submits the selected atomic move", async () => {
    const currentStart = tomorrowAt(12);
    const nextStart = tomorrowAt(13);
    const reservation: Reservation = {
      id: "reservation-1",
      businessId: "business-1",
      customerId: "customer-1",
      serviceTypeId: serviceType.id,
      time: currentStart,
      endsAt: tomorrowAt(13),
      phone: "+14155551000",
      email: "guest@example.com",
      status: "confirmed",
      guests: 2,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const updated = { ...reservation, time: nextStart, endsAt: tomorrowAt(14) };
    apiMocks.getAvailability.mockResolvedValue({
      businessId: "business-1",
      serviceTypeId: serviceType.id,
      timezone: "UTC",
      durationMinutes: 60,
      slotIntervalMinutes: 30,
      maxPartySize: 6,
      dates: [
        {
          date: currentStart.slice(0, 10),
          slots: [
            { startsAt: currentStart, endsAt: tomorrowAt(13) },
            { startsAt: nextStart, endsAt: tomorrowAt(14) },
          ],
        },
      ],
    });
    apiMocks.reschedule.mockResolvedValue(updated);
    const onRescheduled = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <RescheduleReservationDialog
        reservation={reservation}
        open
        onOpenChange={vi.fn()}
        serviceTypes={[serviceType]}
        businessTimezone="UTC"
        businessMaxGuests={8}
        onRescheduled={onRescheduled}
      />,
    );

    expect(container.querySelector('input[type="time"]')).toBeNull();
    await screen.findByRole("button", { name: "13:00" });
    await user.click(screen.getByRole("button", { name: "13:00" }));
    await user.click(screen.getByRole("button", { name: "Confirm reschedule" }));

    await waitFor(() =>
      expect(apiMocks.reschedule).toHaveBeenCalledWith("reservation-1", {
        serviceTypeId: "service-1",
        time: nextStart,
        guests: 2,
      }),
    );
    expect(onRescheduled).toHaveBeenCalledWith(updated);
  });
});
