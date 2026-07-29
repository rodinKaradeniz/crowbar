import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const handlers = [
  // ─── Auth ─────────────────────────────────────────────────────────────────

  // Login (BFF route used by AuthContext)
  http.post("/api/auth/login", async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.email === "test@example.com" && body.password === "password123") {
      return HttpResponse.json({
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        type: "customer",
        createdAt: "2026-01-01T00:00:00Z",
      });
    }
    return new HttpResponse(null, { status: 401 });
  }),

  // Session check (BFF route used by AuthContext on mount)
  http.get("/api/auth/session", () => {
    return new HttpResponse(null, { status: 401 });
  }),

  // Logout
  http.post("/api/auth/logout", () => {
    return HttpResponse.json({ message: "Logged out" });
  }),

  // ─── Public endpoints (client-api uses /api/backend prefix) ───────────────

  // List businesses
  http.get("/api/backend/businesses", () => {
    return HttpResponse.json([
      {
        id: "biz-1",
        name: "Cool Bar",
        slug: "cool-bar",
        email: "bar@test.com",
        phone: "+31612345678",
        address: "123 Main St",
        description: "A cool bar",
        image: null,
        website: null,
        tags: ["bar", "nightlife"],
        max_guests: 50,
        reservation_time: 60,
        time_slot_interval: 30,
        advance_booking_days: 14,
        operating_hours: {},
        public_reservations_enabled: false,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
  }),

  // Get business by slug
  http.get("/api/backend/businesses/slug/:slug", ({ params }) => {
    if (params.slug === "cool-bar") {
      return HttpResponse.json({
        id: "biz-1",
        name: "Cool Bar",
        slug: "cool-bar",
        email: "bar@test.com",
        phone: "+31612345678",
        address: "123 Main St",
        description: "A cool bar",
        image: null,
        website: null,
        tags: ["bar", "nightlife"],
        max_guests: 50,
        reservation_time: 60,
        time_slot_interval: 30,
        advance_booking_days: 14,
        operating_hours: {},
        public_reservations_enabled: false,
        created_at: "2026-01-01T00:00:00Z",
      });
    }
    return new HttpResponse(null, { status: 404 });
  }),

  // List service types for a business
  http.get("/api/backend/service-types/business/:businessId", () => {
    return HttpResponse.json([
      {
        id: "st-1",
        business_id: "biz-1",
        name: "VIP Table",
        description: "Premium seating",
        capacity: 8,
        max_concurrent_bookings: 1,
        is_pending_enabled: true,
        duration: 120,
        color: "#ff0000",
        display_order: 1,
        image: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]);
  }),

  http.get("/api/backend/availability/business/:businessId", ({ request, params }) => {
    const url = new URL(request.url);
    const requestedDate = url.searchParams.get("start_date") ?? "2026-01-02";
    return HttpResponse.json({
      business_id: params.businessId,
      service_type_id: url.searchParams.get("service_type_id"),
      timezone: "Europe/Amsterdam",
      duration_minutes: 120,
      slot_interval_minutes: 30,
      max_party_size: 8,
      dates: [
        {
          date: requestedDate,
          slots: [
            {
              starts_at: `${requestedDate}T18:00:00+01:00`,
              ends_at: `${requestedDate}T20:00:00+01:00`,
            },
          ],
        },
      ],
    });
  }),
];

export const server = setupServer(...handlers);
