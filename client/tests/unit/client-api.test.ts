import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { server } from "../mocks/handlers";
import {
  clientGetBusinesses,
  clientGetBusinessBySlug,
  clientGetServiceTypesByBusiness,
} from "@/lib/client-api";

// Start MSW server for network-level mocking
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("clientGetBusinesses", () => {
  it("fetches and transforms businesses from snake_case to camelCase", async () => {
    const businesses = await clientGetBusinesses();

    expect(businesses).toHaveLength(1);
    expect(businesses[0].name).toBe("Cool Bar");
    expect(businesses[0].slug).toBe("cool-bar");
    expect(businesses[0].maxGuests).toBe(50);
    expect(businesses[0].timeSlotInterval).toBe(30);
    expect(businesses[0].advanceBookingDays).toBe(14);
    expect(businesses[0].reservationTime).toBe(60);
    expect(businesses[0].createdAt).toBe("2026-01-01T00:00:00Z");
  });

  it("does not leak snake_case keys into the result", async () => {
    const businesses = await clientGetBusinesses();
    const biz = businesses[0] as unknown as Record<string, unknown>;

    expect(biz).not.toHaveProperty("max_guests");
    expect(biz).not.toHaveProperty("time_slot_interval");
    expect(biz).not.toHaveProperty("advance_booking_days");
    expect(biz).not.toHaveProperty("reservation_time");
    expect(biz).not.toHaveProperty("created_at");
  });
});

describe("clientGetBusinessBySlug", () => {
  it("returns a business for a valid slug", async () => {
    const business = await clientGetBusinessBySlug("cool-bar");
    expect(business).not.toBeNull();
    expect(business!.name).toBe("Cool Bar");
    expect(business!.id).toBe("biz-1");
  });

  it("returns null for a non-existent slug", async () => {
    const business = await clientGetBusinessBySlug("non-existent");
    expect(business).toBeNull();
  });
});

describe("clientGetServiceTypesByBusiness", () => {
  it("fetches and transforms service types", async () => {
    const serviceTypes = await clientGetServiceTypesByBusiness("biz-1");

    expect(serviceTypes).toHaveLength(1);
    expect(serviceTypes[0].name).toBe("VIP Table");
    expect(serviceTypes[0].businessId).toBe("biz-1");
    expect(serviceTypes[0].color).toBe("#ff0000");
    expect(serviceTypes[0].maxConcurrentBookings).toBe(1);
  });

  it("does not leak snake_case keys into service type result", async () => {
    const serviceTypes = await clientGetServiceTypesByBusiness("biz-1");
    const st = serviceTypes[0] as unknown as Record<string, unknown>;

    expect(st).not.toHaveProperty("business_id");
    expect(st).not.toHaveProperty("requires_payment");
    expect(st).not.toHaveProperty("max_concurrent_bookings");
    expect(st).not.toHaveProperty("display_order");
    expect(st).not.toHaveProperty("created_at");
    expect(st).not.toHaveProperty("updated_at");
  });
});
