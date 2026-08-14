import { cookies } from "next/headers";
import {
  BookingSchedule,
  BookingScheduleCollection,
  Business,
  ServiceType,
  Reservation,
  ReservationWaitlistEntry,
  VisitorResponse,
} from "@/types";
import {
  apiGetBusinesses,
  apiGetCurrentBusiness,
  apiGetBusinessBySlug,
  apiGetServiceTypesByBusiness,
  apiGetServiceType,
  apiGetBookingSchedules,
  apiGetBusinessReservations,
  apiGetBusinessStats,
  apiGetBusinessKpis,
  apiGetHighRiskReservations,
  apiGetBusinessCustomers,
  apiGetBusinessVisitors,
  apiGetBusinessStaff,
  apiGetMe,
  apiLogin,
  type BusinessResponse,
  type ServiceTypeResponse,
  type BookingScheduleResponse,
  type ReservationResponse,
  type ReservationWaitlistResponse,
  apiGetReservationWaitlist,
  type VisitorResponseRaw,
  type BusinessDashboardStats,
  type LoginResponse,
} from "./api-client";
import type { MeContext } from "@/types";
import * as mock from "./api-mock";

// ─── Mock mode ──────────────────────────────────────────────────────────────
// When NEXT_PUBLIC_USE_MOCK_API=true, all functions return mock data instead
// of calling the real backend. This allows the frontend to render on Vercel
// (or anywhere) without a running backend.

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

const TOKEN_COOKIE_NAME = "rk-token";

// ─── Token helpers ───────────────────────────────────────────────────────────

export async function getToken(): Promise<string | null> {
  if (USE_MOCK) return mock.getToken();
  const cookieStore = await cookies();
  return cookieStore.get(TOKEN_COOKIE_NAME)?.value || null;
}

export async function setTokenCookie(token: string): Promise<void> {
  if (USE_MOCK) return mock.setTokenCookie();
  const cookieStore = await cookies();
  cookieStore.set(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
}

export async function deleteTokenCookie(): Promise<void> {
  if (USE_MOCK) return mock.deleteTokenCookie();
  const cookieStore = await cookies();
  cookieStore.delete(TOKEN_COOKIE_NAME);
}

// ─── Transform helpers (snake_case → camelCase) ─────────────────────────────

function toBusiness(b: BusinessResponse): Business {
  const raw = b as BusinessResponse & {
    enabled_modules?: string[];
    onboarding_complete?: boolean;
    notification_channels?: string[];
    timezone?: string;
    country_code?: string;
    currency_code?: string;
    locale?: string;
    tax_label?: string;
    legal_drinking_age?: number;
  };
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    email: b.email,
    phone: b.phone,
    timezone: raw.timezone ?? "UTC",
    countryCode: raw.country_code ?? "DE",
    currencyCode: raw.currency_code ?? "EUR",
    locale: raw.locale ?? "de-DE",
    taxLabel: raw.tax_label ?? "VAT",
    legalDrinkingAge: raw.legal_drinking_age ?? 18,
    address: b.address || undefined,
    description: b.description || undefined,
    image: b.image || undefined,
    website: b.website || undefined,
    tags: b.tags || undefined,
    createdAt: b.created_at,
    maxGuests: b.max_guests,
    reservationTime: b.reservation_time,
    timeSlotInterval: b.time_slot_interval,
    advanceBookingDays: b.advance_booking_days,
    operatingHours: b.operating_hours as Business["operatingHours"],
    enabledModules: raw.enabled_modules ?? [],
    onboardingComplete: raw.onboarding_complete ?? false,
    notificationChannels: raw.notification_channels ?? ["email"],
    isAcceptingOrders: raw.is_accepting_orders ?? true,
    publicReservationsEnabled: raw.public_reservations_enabled ?? true,
  };
}

function toServiceType(st: ServiceTypeResponse): ServiceType {
  return {
    id: st.id,
    businessId: st.business_id,
    name: st.name,
    description: st.description || undefined,
    capacity: st.capacity,
    maxConcurrentBookings: st.max_concurrent_bookings ?? undefined,
    availabilityResourceMode: st.availability_resource_mode ?? "legacy",
    reservableCoverCapacity: st.reservable_cover_capacity ?? undefined,
    resourceTurnBufferMinutes: st.resource_turn_buffer_minutes ?? 0,
    isPendingEnabled: st.is_pending_enabled ?? true,
    duration: st.duration || undefined,
    color: st.color,
    displayOrder: st.display_order || undefined,
    image: st.image || undefined,
    createdAt: st.created_at,
    updatedAt: st.updated_at,
  };
}

function toBookingSchedule(schedule: BookingScheduleResponse): BookingSchedule {
  const wallTime = (value: string) => value.slice(0, 5);
  return {
    id: schedule.id,
    businessId: schedule.business_id,
    serviceTypeId: schedule.service_type_id || undefined,
    minimumNoticeMinutes: schedule.minimum_notice_minutes,
    advanceBookingDays: schedule.advance_booking_days,
    slotIntervalMinutes: schedule.slot_interval_minutes,
    defaultDurationMinutes: schedule.default_duration_minutes,
    cancellationWindowMinutes: schedule.cancellation_window_minutes,
    arrivalGracePeriodMinutes: schedule.arrival_grace_period_minutes,
    reminderEnabled: schedule.reminder_enabled,
    reminderLeadMinutes: schedule.reminder_lead_minutes,
    reconfirmationEnabled: schedule.reconfirmation_enabled,
    windows: schedule.windows.map((window) => ({
      id: window.id,
      weekday: window.weekday,
      startTime: wallTime(window.start_time),
      endTime: wallTime(window.end_time),
      endsNextDay: window.ends_next_day,
      createdAt: window.created_at,
      updatedAt: window.updated_at,
    })),
    exceptions: schedule.exceptions.map((exception) => ({
      id: exception.id,
      localDate: exception.local_date,
      isClosed: exception.is_closed,
      windows: exception.windows.map((window) => ({
        id: window.id,
        startTime: wallTime(window.start_time),
        endTime: wallTime(window.end_time),
        endsNextDay: window.ends_next_day,
        createdAt: window.created_at,
        updatedAt: window.updated_at,
      })),
      createdAt: exception.created_at,
      updatedAt: exception.updated_at,
    })),
    createdAt: schedule.created_at,
    updatedAt: schedule.updated_at,
  };
}

function toReservation(r: ReservationResponse): Reservation {
  return {
    id: r.id,
    businessId: r.business_id,
    customerId: r.customer_id,
    serviceTypeId: r.service_type_id,
    time: r.time,
    endsAt: r.ends_at,
    phone: r.phone,
    email: r.email,
    note: r.note || undefined,
    status: r.status as Reservation["status"],
    guests: r.guests,
    availabilityOverrideBy: r.availability_override_by || undefined,
    availabilityOverrideActorName:
      r.availability_override_actor_name || undefined,
    availabilityOverrideReason: r.availability_override_reason || undefined,
    availabilityOverriddenAt: r.availability_overridden_at || undefined,
    cancelledAt: r.cancelled_at || undefined,
    cancelledBy: (r.cancelled_by as Reservation["cancelledBy"]) || undefined,
    cancelledLate: r.cancelled_late ?? undefined,
    noShowAt: r.no_show_at || undefined,
    noShowNote: r.no_show_note || undefined,
    reconfirmedAt: r.reconfirmed_at || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toReservationWaitlistEntry(entry: ReservationWaitlistResponse): ReservationWaitlistEntry {
  return {
    id: entry.id, businessId: entry.business_id, serviceTypeId: entry.service_type_id,
    customerId: entry.customer_id, requestedStartsAt: entry.requested_starts_at,
    flexibleUntil: entry.flexible_until, guests: entry.guests,
    status: entry.status as ReservationWaitlistEntry["status"],
    offeredAt: entry.offered_at || undefined,
    offeredReservationTime: entry.offered_reservation_time || undefined,
    offerExpiresAt: entry.offer_expires_at || undefined,
    acceptedAt: entry.accepted_at || undefined,
    createdAt: entry.created_at, updatedAt: entry.updated_at,
  };
}

// ─── Auth (server-side) ─────────────────────────────────────────────────────

export type { LoginResponse };

export async function serverLogin(email: string, password: string) {
  if (USE_MOCK) return mock.serverLogin();
  return apiLogin(email, password);
}

export async function serverGetMe() {
  if (USE_MOCK) return mock.serverGetMe();
  const token = await getToken();
  if (!token) return null;

  try {
    return await apiGetMe(token);
  } catch {
    return null;
  }
}

export async function serverGetMeContext(): Promise<MeContext | null> {
  if (USE_MOCK) return null;
  const token = await getToken();
  if (!token) return null;

  try {
    const apiUrl =
      process.env.API_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:8000";
    const res = await fetch(`${apiUrl}/api/auth/me/context`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        phone: data.user.phone,
        avatar: data.user.avatar,
        userType: data.user.user_type,
      },
      business: {
        id: data.business.id,
        name: data.business.name,
        slug: data.business.slug,
        enabledModules: data.business.enabled_modules ?? [],
        onboardingComplete: data.business.onboarding_complete ?? false,
        notificationChannels: data.business.notification_channels ?? ["email"],
        locations: data.business.locations ?? [],
      },
      role: data.role,
      permissions: data.permissions ?? [],
      enabledModules: data.enabled_modules ?? [],
    };
  } catch {
    return null;
  }
}

// ─── Businesses ──────────────────────────────────────────────────────────────

export async function fetchBusinesses(): Promise<Business[]> {
  if (USE_MOCK) return mock.fetchBusinesses();
  const data = await apiGetBusinesses();
  return data.map(toBusiness);
}

export async function fetchBusiness(id: string): Promise<Business | null> {
  if (USE_MOCK) return mock.fetchBusiness(id);
  try {
    const token = await getToken();
    if (!token) return null;
    const data = await apiGetCurrentBusiness(token);
    if (data.id !== id) return null;
    return toBusiness(data);
  } catch {
    return null;
  }
}

export async function fetchBusinessBySlug(slug: string): Promise<Business | null> {
  if (USE_MOCK) return mock.fetchBusinessBySlug(slug);
  try {
    const data = await apiGetBusinessBySlug(slug);
    return toBusiness(data);
  } catch {
    return null;
  }
}

// ─── Service Types ───────────────────────────────────────────────────────────

export async function fetchServiceTypesByBusiness(
  businessId: string
): Promise<ServiceType[]> {
  if (USE_MOCK) return mock.fetchServiceTypesByBusiness(businessId);
  const token = await getToken();
  const data = await apiGetServiceTypesByBusiness(businessId, token || undefined);
  return data.map(toServiceType);
}

export async function fetchServiceType(id: string): Promise<ServiceType | null> {
  if (USE_MOCK) return mock.fetchServiceType(id);
  try {
    const token = await getToken();
    const data = await apiGetServiceType(id, token || undefined);
    return toServiceType(data);
  } catch {
    return null;
  }
}

export async function fetchBookingSchedules(): Promise<BookingScheduleCollection | null> {
  if (USE_MOCK) return null;
  const token = await getToken();
  if (!token) return null;
  try {
    const data = await apiGetBookingSchedules(token);
    return {
      defaultSchedule: toBookingSchedule(data.default_schedule),
      serviceOverrides: data.service_overrides.map(toBookingSchedule),
    };
  } catch {
    return null;
  }
}

// ─── Reservations ────────────────────────────────────────────────────────────

export async function fetchBusinessReservations(
  businessId: string,
  status?: string
): Promise<Reservation[]> {
  if (USE_MOCK) return mock.fetchBusinessReservations(businessId, status);
  const token = await getToken();
  if (!token) return [];
  const data = await apiGetBusinessReservations(businessId, token, status);
  return data.map(toReservation);
}

export async function fetchReservationWaitlist(): Promise<ReservationWaitlistEntry[]> {
  if (USE_MOCK) return [];
  const token = await getToken();
  if (!token) return [];
  return (await apiGetReservationWaitlist(token)).map(toReservationWaitlistEntry);
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export async function fetchBusinessDashboardStats(
  businessId: string
): Promise<BusinessDashboardStats | null> {
  if (USE_MOCK) return mock.fetchBusinessDashboardStats(businessId);
  const token = await getToken();
  if (!token) return null;
  try {
    return await apiGetBusinessStats(businessId, token);
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchBusinessKpis(businessId: string): Promise<any | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    return await apiGetBusinessKpis(businessId, token);
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchHighRiskReservations(businessId: string): Promise<any[]> {
  const token = await getToken();
  if (!token) return [];
  try {
    return await apiGetHighRiskReservations(businessId, token);
  } catch {
    return [];
  }
}

// ─── Customers ───────────────────────────────────────────────────────────────

export async function fetchBusinessCustomers(businessId: string) {
  if (USE_MOCK) return mock.fetchBusinessCustomers(businessId);
  const token = await getToken();
  if (!token) return [];
  return apiGetBusinessCustomers(businessId, token);
}

function toVisitor(raw: VisitorResponseRaw): VisitorResponse {
  return {
    id: raw.id,
    name: raw.name ?? "Unknown",
    phone: raw.phone,
    email: raw.email,
    source: raw.source,
    visitCount: raw.visit_count,
    lastVisit: raw.last_visit,
    partySize: raw.party_size,
  };
}

export async function fetchBusinessVisitors(businessId: string): Promise<VisitorResponse[]> {
  if (USE_MOCK) return mock.fetchBusinessVisitors(businessId);
  const token = await getToken();
  if (!token) return [];
  const raw = await apiGetBusinessVisitors(businessId, token);
  return raw.map(toVisitor);
}

// ─── Staff ───────────────────────────────────────────────────────────────────

export async function fetchBusinessStaff(businessId: string) {
  if (USE_MOCK) return mock.fetchBusinessStaff(businessId);
  const token = await getToken();
  if (!token) return [];
  return apiGetBusinessStaff(businessId, token);
}
