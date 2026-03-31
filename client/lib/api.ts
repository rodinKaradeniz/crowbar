import { cookies } from "next/headers";
import { Business, ServiceType, Reservation, FormFieldDefinition } from "@/types";
import {
  apiGetBusinesses,
  apiGetBusiness,
  apiGetBusinessBySlug,
  apiGetServiceTypesByBusiness,
  apiGetServiceType,
  apiGetBusinessReservations,
  apiGetCustomerReservations,
  apiGetMyReservations,
  apiGetBusinessStats,
  apiGetMyCustomerStats,
  apiGetBusinessCustomers,
  apiGetCustomer,
  apiGetBusinessStaff,
  apiGetMe,
  apiLogin,
  type BusinessResponse,
  type ServiceTypeResponse,
  type ReservationResponse,
  type UserResponse,
  type StaffResponse,
  type BusinessDashboardStats,
  type CustomerDashboardStats,
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
  };
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    email: b.email,
    phone: b.phone,
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
  };
}

function toServiceType(st: ServiceTypeResponse): ServiceType {
  const formFields: FormFieldDefinition[] | undefined = st.form_fields
    ? st.form_fields.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type as FormFieldDefinition["type"],
        required: f.required,
        placeholder: f.placeholder,
        options: f.options,
        min: f.min,
        max: f.max,
        maxLength: f.max_length,
        order: f.order,
        system: f.system,
      }))
    : undefined;

  return {
    id: st.id,
    businessId: st.business_id,
    name: st.name,
    description: st.description || undefined,
    capacity: st.capacity,
    maxConcurrentBookings: st.max_concurrent_bookings || undefined,
    requiresPayment: st.requires_payment,
    amount: st.amount || undefined,
    isOnline: st.is_online ?? false,
    isPendingEnabled: st.is_pending_enabled ?? true,
    duration: st.duration || undefined,
    color: st.color,
    displayOrder: st.display_order || undefined,
    image: st.image || undefined,
    formFields,
    createdAt: st.created_at,
    updatedAt: st.updated_at,
  };
}

function toReservation(r: ReservationResponse): Reservation {
  return {
    id: r.id,
    businessId: r.business_id,
    customerId: r.customer_id,
    serviceTypeId: r.service_type_id,
    time: r.time,
    phone: r.phone,
    email: r.email,
    note: r.note || undefined,
    status: r.status as Reservation["status"],
    guests: r.guests,
    paymentAmount: r.payment_amount || undefined,
    paymentStatus: r.payment_status as Reservation["paymentStatus"],
    stripePaymentIntentId: r.stripe_payment_intent_id || undefined,
    customFields: r.custom_fields || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
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
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
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
    const data = await apiGetBusiness(id, token || undefined);
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

export async function fetchCustomerReservations(
  customerId: string
): Promise<Reservation[]> {
  if (USE_MOCK) return mock.fetchCustomerReservations(customerId);
  const token = await getToken();
  if (!token) return [];
  const data = await apiGetCustomerReservations(customerId, token);
  return data.map(toReservation);
}

export async function fetchMyReservations(): Promise<Reservation[]> {
  if (USE_MOCK) return mock.fetchMyReservations();
  const token = await getToken();
  if (!token) return [];
  const data = await apiGetMyReservations(token);
  return data.map(toReservation);
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

export async function fetchMyCustomerStats(): Promise<CustomerDashboardStats | null> {
  if (USE_MOCK) return mock.fetchMyCustomerStats();
  const token = await getToken();
  if (!token) return null;
  try {
    return await apiGetMyCustomerStats(token);
  } catch {
    return null;
  }
}

// ─── Customers ───────────────────────────────────────────────────────────────

export async function fetchBusinessCustomers(businessId: string) {
  if (USE_MOCK) return mock.fetchBusinessCustomers(businessId);
  const token = await getToken();
  if (!token) return [];
  return apiGetBusinessCustomers(businessId, token);
}

export async function fetchCustomer(customerId: string) {
  if (USE_MOCK) return mock.fetchCustomer(customerId);
  const token = await getToken();
  if (!token) return null;
  try {
    return await apiGetCustomer(customerId, token);
  } catch {
    return null;
  }
}

// ─── Staff ───────────────────────────────────────────────────────────────────

export async function fetchBusinessStaff(businessId: string) {
  if (USE_MOCK) return mock.fetchBusinessStaff(businessId);
  const token = await getToken();
  if (!token) return [];
  return apiGetBusinessStaff(businessId, token);
}
