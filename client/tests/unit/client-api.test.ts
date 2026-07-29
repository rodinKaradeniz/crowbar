import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/handlers";
import {
  clientCreatePublicReservation,
  clientGetBusinesses,
  clientGetBusinessBySlug,
  clientGetServiceTypesByBusiness,
  clientGetAvailability,
  clientGetBookingSchedules,
  clientReplaceServiceBookingSchedule,
  clientGetReservationRescheduleAvailability,
  clientGetStaffReservationAvailability,
  clientGetStaffOverrideTimes,
  clientCreateStaffReservation,
  clientRescheduleReservation,
  clientUpdateBusiness,
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
    expect(businesses[0].publicReservationsEnabled).toBe(false);
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

describe("clientUpdateBusiness", () => {
  it("sends the public booking setting in snake case", async () => {
    let requestBody: unknown;
    server.use(
      http.patch("/api/proxy/businesses/biz-1", async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          id: "biz-1",
          name: "Cool Bar",
          slug: "cool-bar",
          email: "bar@test.com",
          phone: "+31612345678",
          max_guests: 50,
          reservation_time: 60,
          time_slot_interval: 30,
          advance_booking_days: 14,
          operating_hours: {},
          public_reservations_enabled: false,
          created_at: "2026-01-01T00:00:00Z",
        });
      }),
    );

    const business = await clientUpdateBusiness("biz-1", { publicReservationsEnabled: false });

    expect(requestBody).toEqual({ public_reservations_enabled: false });
    expect(business.publicReservationsEnabled).toBe(false);
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
    expect(serviceTypes[0].availabilityResourceMode).toBe("legacy");
    expect(serviceTypes[0].resourceTurnBufferMinutes).toBe(0);
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

describe("clientGetAvailability", () => {
  it("maps absolute server slots and booking policy metadata", async () => {
    const availability = await clientGetAvailability({
      businessId: "biz-1",
      serviceTypeId: "st-1",
      startDate: "2026-01-02",
      guests: 2,
    });

    expect(availability).toEqual({
      businessId: "biz-1",
      serviceTypeId: "st-1",
      timezone: "Europe/Amsterdam",
      durationMinutes: 120,
      slotIntervalMinutes: 30,
      maxPartySize: 8,
      dates: [
        {
          date: "2026-01-02",
          slots: [
            {
              startsAt: "2026-01-02T18:00:00+01:00",
              endsAt: "2026-01-02T20:00:00+01:00",
            },
          ],
        },
      ],
    });
  });
});

const bookingScheduleResponse = {
  id: "schedule-1",
  business_id: "biz-1",
  service_type_id: null,
  minimum_notice_minutes: 60,
  advance_booking_days: 45,
  slot_interval_minutes: 15,
  default_duration_minutes: 90,
  windows: [
    {
      id: "window-1",
      weekday: 0,
      start_time: "18:00:00",
      end_time: "02:00:00",
      ends_next_day: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ],
  exceptions: [
    {
      id: "exception-1",
      local_date: "2026-12-25",
      is_closed: true,
      windows: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("booking schedule management", () => {
  it("maps the authenticated schedule collection and wall times", async () => {
    server.use(
      http.get("/api/proxy/booking-schedules", () =>
        HttpResponse.json({
          default_schedule: bookingScheduleResponse,
          service_overrides: [],
        }),
      ),
    );

    const schedules = await clientGetBookingSchedules();

    expect(schedules.defaultSchedule.minimumNoticeMinutes).toBe(60);
    expect(schedules.defaultSchedule.windows[0]).toMatchObject({
      weekday: 0,
      startTime: "18:00",
      endTime: "02:00",
      endsNextDay: true,
    });
    expect(schedules.defaultSchedule.exceptions[0].localDate).toBe("2026-12-25");
  });

  it("sends a complete snake_case service override without client-only IDs", async () => {
    let requestBody: unknown;
    server.use(
      http.put(
        "/api/proxy/booking-schedules/service-types/st-1",
        async ({ request }) => {
          requestBody = await request.json();
          return HttpResponse.json({
            ...bookingScheduleResponse,
            service_type_id: "st-1",
          });
        },
      ),
    );

    await clientReplaceServiceBookingSchedule("st-1", {
      minimumNoticeMinutes: 60,
      advanceBookingDays: 45,
      slotIntervalMinutes: 15,
      defaultDurationMinutes: 90,
      windows: [
        {
          id: "client-copy",
          weekday: 0,
          startTime: "18:00",
          endTime: "02:00",
          endsNextDay: true,
        },
      ],
      exceptions: [],
    });

    expect(requestBody).toEqual({
      minimum_notice_minutes: 60,
      advance_booking_days: 45,
      slot_interval_minutes: 15,
      default_duration_minutes: 90,
      windows: [
        {
          weekday: 0,
          start_time: "18:00",
          end_time: "02:00",
          ends_next_day: true,
        },
      ],
      exceptions: [],
    });
  });
});

describe("staff rescheduling", () => {
  it("loads tenant-derived staff creation availability", async () => {
    let requestUrl = "";
    server.use(
      http.get("/api/proxy/reservations/availability", ({ request }) => {
        requestUrl = request.url;
        return HttpResponse.json({
          business_id: "biz-1",
          service_type_id: "st-1",
          timezone: "UTC",
          duration_minutes: 60,
          slot_interval_minutes: 30,
          max_party_size: 8,
          dates: [{ date: "2026-01-02", slots: [] }],
        });
      }),
    );

    await clientGetStaffReservationAvailability({
      serviceTypeId: "st-1",
      startDate: "2026-01-02",
      guests: 2,
    });

    expect(requestUrl).toContain("service_type_id=st-1");
    expect(requestUrl).not.toContain("business_id");
  });

  it("loads privileged server-generated override times", async () => {
    let query = "";
    server.use(
      http.get("/api/proxy/reservations/override-times", ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json({
          business_id: "biz-1",
          service_type_id: "st-1",
          timezone: "UTC",
          duration_minutes: 60,
          slot_interval_minutes: 30,
          max_party_size: 8,
          dates: [{ date: "2026-01-02", slots: [] }],
        });
      }),
    );

    await clientGetStaffOverrideTimes({
      serviceTypeId: "st-1",
      localDate: "2026-01-02",
      guests: 2,
    });

    expect(query).toContain("local_date=2026-01-02");
    expect(query).toContain("guests=2");
  });

  it("creates staff reservations without a browser-supplied business id", async () => {
    let requestBody: Record<string, unknown> = {};
    server.use(
      http.post("/api/proxy/reservations", async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "res-1",
          business_id: "biz-1",
          customer_id: "customer-1",
          service_type_id: "st-1",
          time: "2026-01-02T22:00:00Z",
          ends_at: "2026-01-02T23:00:00Z",
          phone: "+31612345678",
          email: "guest@example.com",
          note: null,
          status: "confirmed",
          guests: 2,
          availability_override_by: "user-1",
          availability_override_actor_name: "Owner",
          availability_override_reason: "Private event approved by owner",
          availability_overridden_at: "2026-01-01T00:00:00Z",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        });
      }),
    );

    const reservation = await clientCreateStaffReservation({
      serviceTypeId: "st-1",
      time: "2026-01-02T22:00:00Z",
      name: "Guest",
      phone: "+31612345678",
      email: "guest@example.com",
      guests: 2,
      availabilityOverrideReason: "Private event approved by owner",
    });

    expect(requestBody).not.toHaveProperty("business_id");
    expect(requestBody).toMatchObject({
      service_type_id: "st-1",
      name: "Guest",
      availability_override_reason: "Private event approved by owner",
    });
    expect(reservation.availabilityOverrideActorName).toBe("Owner");
  });

  it("loads authenticated availability that excludes the current reservation", async () => {
    let query = "";
    server.use(
      http.get(
        "/api/proxy/reservations/res-1/availability",
        ({ request }) => {
          query = new URL(request.url).search;
          return HttpResponse.json({
            business_id: "biz-1",
            service_type_id: "st-1",
            timezone: "Europe/Amsterdam",
            duration_minutes: 120,
            slot_interval_minutes: 30,
            max_party_size: 8,
            dates: [
              {
                date: "2026-01-02",
                slots: [
                  {
                    starts_at: "2026-01-02T18:00:00+01:00",
                    ends_at: "2026-01-02T20:00:00+01:00",
                  },
                ],
              },
            ],
          });
        },
      ),
    );

    const availability = await clientGetReservationRescheduleAvailability({
      reservationId: "res-1",
      serviceTypeId: "st-1",
      startDate: "2026-01-02",
      guests: 4,
    });

    expect(query).toContain("service_type_id=st-1");
    expect(query).toContain("start_date=2026-01-02");
    expect(query).toContain("guests=4");
    expect(availability.dates[0].slots[0].startsAt).toBe(
      "2026-01-02T18:00:00+01:00",
    );
  });

  it("sends the complete atomic move command in snake_case", async () => {
    let requestBody: unknown;
    server.use(
      http.post(
        "/api/proxy/reservations/res-1/reschedule",
        async ({ request }) => {
          requestBody = await request.json();
          return HttpResponse.json({
            id: "res-1",
            business_id: "biz-1",
            customer_id: "customer-1",
            service_type_id: "st-2",
            time: "2026-01-02T19:00:00+01:00",
            ends_at: "2026-01-02T20:30:00+01:00",
            phone: "+31612345678",
            email: "guest@example.com",
            note: null,
            status: "confirmed",
            guests: 4,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          });
        },
      ),
    );

    const reservation = await clientRescheduleReservation("res-1", {
      serviceTypeId: "st-2",
      time: "2026-01-02T19:00:00+01:00",
      guests: 4,
    });

    expect(requestBody).toEqual({
      service_type_id: "st-2",
      time: "2026-01-02T19:00:00+01:00",
      guests: 4,
    });
    expect(reservation).toMatchObject({
      serviceTypeId: "st-2",
      endsAt: "2026-01-02T20:30:00+01:00",
      guests: 4,
    });
  });
});

describe("structured API errors", () => {
  it("preserves slot-conflict alternatives for the booking UI", async () => {
    server.use(
      http.post("/api/backend/reservations/public", () =>
        HttpResponse.json(
          {
            code: "SLOT_UNAVAILABLE",
            message: "That reservation time is no longer available",
            details: {
              alternatives: [
                {
                  starts_at: "2026-01-02T18:30:00+01:00",
                  ends_at: "2026-01-02T20:30:00+01:00",
                },
              ],
            },
          },
          { status: 409 },
        ),
      ),
    );

    const request = clientCreatePublicReservation({
      businessId: "biz-1",
      serviceTypeId: "st-1",
      time: "2026-01-02T18:00:00+01:00",
      name: "Guest",
      phone: "+31612345678",
      email: "guest@example.com",
      guests: 2,
    });

    await expect(request).rejects.toMatchObject({
      status: 409,
      code: "SLOT_UNAVAILABLE",
      message: "That reservation time is no longer available",
      details: {
        alternatives: [
          {
            starts_at: "2026-01-02T18:30:00+01:00",
            ends_at: "2026-01-02T20:30:00+01:00",
          },
        ],
      },
    });
  });
});
