import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReservationForm } from "@/components/reservation-form";
import { ServiceType } from "@/types";
import { server } from "../mocks/handlers";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const serviceType: ServiceType = {
  id: "st-1",
  businessId: "biz-1",
  name: "VIP Table",
  capacity: 8,
  maxConcurrentBookings: 1,
  isPendingEnabled: true,
  duration: 120,
  color: "#ff0000",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("ReservationForm availability", () => {
  it("renders server-returned slots after the guest selects a party size", async () => {
    const user = userEvent.setup();
    render(
      <ReservationForm
        businessId="biz-1"
        businessTimezone="Europe/Amsterdam"
        businessMaxGuests={50}
        serviceTypes={[serviceType]}
        preselectedServiceTypeId={serviceType.id}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Number of Guests" }));
    await user.click(screen.getByRole("option", { name: "2 guests" }));

    const localDateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const part = (name: Intl.DateTimeFormatPartTypes) =>
      localDateParts.find((item) => item.type === name)?.value;
    const serverStart = `${part("year")}-${part("month")}-${part("day")}T18:00:00+01:00`;
    const displayedTime = new Intl.DateTimeFormat(undefined, {
      timeZone: "Europe/Amsterdam",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(serverStart));

    expect(
      await screen.findByRole("button", { name: displayedTime }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /17:45/ })).not.toBeInTheDocument();
  });
});
