import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffReservationDialog } from "@/components/staff-reservation-dialog";
import type { Reservation, ServiceType } from "@/types";

const apiMocks = vi.hoisted(() => ({
  getAvailability: vi.fn(),
  getStaffAvailability: vi.fn(),
  getOverrideTimes: vi.fn(),
  reschedule: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-api")>()),
  clientGetReservationRescheduleAvailability: apiMocks.getAvailability,
  clientGetStaffReservationAvailability: apiMocks.getStaffAvailability,
  clientGetStaffOverrideTimes: apiMocks.getOverrideTimes,
  clientRescheduleReservation: apiMocks.reschedule,
  clientCreateStaffReservation: apiMocks.create,
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

function reservationAt(start: string): Reservation {
  return {
    id: "reservation-1",
    businessId: "business-1",
    customerId: "customer-1",
    serviceTypeId: serviceType.id,
    time: start,
    endsAt: tomorrowAt(13),
    phone: "+14155551000",
    email: "guest@example.com",
    status: "confirmed",
    guests: 2,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function availability(slots: Array<{ startsAt: string; endsAt: string }>) {
  return {
    businessId: "business-1",
    serviceTypeId: serviceType.id,
    timezone: "UTC",
    durationMinutes: 60,
    slotIntervalMinutes: 30,
    maxPartySize: 6,
    dates: [{ date: tomorrowAt(12).slice(0, 10), slots }],
  };
}

describe("StaffReservationDialog", () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
  });

  it("offers only server-returned slots for a normal atomic move", async () => {
    const currentStart = tomorrowAt(12);
    const nextStart = tomorrowAt(13);
    const reservation = reservationAt(currentStart);
    const updated = { ...reservation, time: nextStart, endsAt: tomorrowAt(14) };
    apiMocks.getAvailability.mockResolvedValue(
      availability([
        { startsAt: currentStart, endsAt: tomorrowAt(13) },
        { startsAt: nextStart, endsAt: tomorrowAt(14) },
      ]),
    );
    apiMocks.reschedule.mockResolvedValue(updated);
    const onCompleted = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <StaffReservationDialog
        reservation={reservation}
        open
        onOpenChange={vi.fn()}
        serviceTypes={[serviceType]}
        businessTimezone="UTC"
        businessMaxGuests={8}
        canOverride
        mode="reschedule"
        onCompleted={onCompleted}
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
        availabilityOverrideReason: undefined,
      }),
    );
    expect(onCompleted).toHaveBeenCalledWith(updated);
  });

  it("requires a reason and submits only server-generated override times", async () => {
    const currentStart = tomorrowAt(12);
    const overrideStart = tomorrowAt(22);
    const reservation = reservationAt(currentStart);
    apiMocks.getAvailability.mockResolvedValue(availability([]));
    apiMocks.getOverrideTimes.mockResolvedValue(
      availability([{ startsAt: overrideStart, endsAt: tomorrowAt(23) }]),
    );
    apiMocks.reschedule.mockResolvedValue({ ...reservation, time: overrideStart });
    const user = userEvent.setup();
    const { container } = render(
      <StaffReservationDialog
        reservation={reservation}
        open
        onOpenChange={vi.fn()}
        serviceTypes={[serviceType]}
        businessTimezone="UTC"
        businessMaxGuests={8}
        canOverride
        mode="reschedule"
        onCompleted={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Override availability" }));
    await screen.findByRole("combobox", { name: "Override time" });
    expect(container.querySelector('input[type="time"]')).toBeNull();
    await user.click(screen.getByRole("combobox", { name: "Override time" }));
    await user.click(
      await screen.findByRole("option", { name: /^22:00/ }),
    );
    await user.type(
      screen.getByLabelText("Override reason"),
      "Private event approved by manager",
    );
    await user.click(
      screen.getByRole("button", { name: "Reschedule with override" }),
    );

    await waitFor(() =>
      expect(apiMocks.reschedule).toHaveBeenCalledWith("reservation-1", {
        serviceTypeId: "service-1",
        time: overrideStart,
        guests: 2,
        availabilityOverrideReason: "Private event approved by manager",
      }),
    );
  });
});
