const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface FetchOptions extends RequestInit {
  token?: string;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((customHeaders as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...rest,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorBody.detail || response.statusText
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  user_type: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatar: string | null;
  user_type: string;
  created_at: string;
  business_id?: string;
  role?: string;
}

export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function apiGetMe(token: string): Promise<UserResponse> {
  return apiFetch("/api/auth/me", { token });
}

// ─── Businesses ──────────────────────────────────────────────────────────────

export interface BusinessResponse {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string;
  address: string | null;
  description: string | null;
  image: string | null;
  website: string | null;
  tags: string[] | null;
  max_guests: number;
  reservation_time: number;
  time_slot_interval: number;
  advance_booking_days: number;
  operating_hours: Record<string, { open?: string; close?: string; closed?: boolean }>;
  created_at: string;
}

export async function apiGetBusinesses(): Promise<BusinessResponse[]> {
  return apiFetch("/api/businesses");
}

export async function apiGetBusiness(id: string, token?: string): Promise<BusinessResponse> {
  return apiFetch(`/api/businesses/${id}`, { token });
}

export async function apiGetBusinessBySlug(slug: string): Promise<BusinessResponse> {
  return apiFetch(`/api/businesses/slug/${slug}`);
}

// ─── Service Types ───────────────────────────────────────────────────────────

export interface ServiceTypeResponse {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  capacity: number;
  max_concurrent_bookings: number | null;
  is_pending_enabled: boolean;
  duration: number | null;
  color: string;
  display_order: number | null;
  image: string | null;
  created_at: string;
  updated_at: string;
}

export async function apiGetServiceTypesByBusiness(
  businessId: string,
  token?: string
): Promise<ServiceTypeResponse[]> {
  return apiFetch(`/api/service-types/business/${businessId}`, { token });
}

export async function apiGetServiceType(
  id: string,
  token?: string
): Promise<ServiceTypeResponse> {
  return apiFetch(`/api/service-types/${id}`, { token });
}

// ─── Reservations ────────────────────────────────────────────────────────────

export interface ReservationResponse {
  id: string;
  business_id: string;
  customer_id: string;
  service_type_id: string;
  time: string;
  phone: string;
  email: string;
  note: string | null;
  status: string;
  guests: number;
  created_at: string;
  updated_at: string;
}

export async function apiGetBusinessReservations(
  businessId: string,
  token: string,
  status?: string
): Promise<ReservationResponse[]> {
  const query = status ? `?status=${status}` : "";
  return apiFetch(`/api/reservations/business/${businessId}${query}`, { token });
}

export async function apiCreateReservation(
  data: {
    business_id: string;
    service_type_id: string;
    time: string;
    phone: string;
    email: string;
    note?: string;
    guests: number;
  },
  token: string
): Promise<ReservationResponse> {
  return apiFetch("/api/reservations", {
    method: "POST",
    body: JSON.stringify(data),
    token,
  });
}

export async function apiUpdateReservation(
  id: string,
  data: Partial<{
    service_type_id: string;
    time: string;
    phone: string;
    email: string;
    note: string;
    status: string;
    guests: number;
  }>,
  token: string
): Promise<ReservationResponse> {
  return apiFetch(`/api/reservations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
    token,
  });
}

export async function apiDeleteReservation(id: string, token: string): Promise<void> {
  return apiFetch(`/api/reservations/${id}`, {
    method: "DELETE",
    token,
  });
}

// ─── Customers ───────────────────────────────────────────────────────────────

export interface CustomerResponse {
  id: string;
  business_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisitorResponseRaw {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: "reservation" | "walkin";
  visit_count: number;
  last_visit: string | null;
  party_size: number | null;
}

export async function apiGetBusinessCustomers(
  businessId: string,
  token: string
): Promise<CustomerResponse[]> {
  return apiFetch(`/api/customers/business/${businessId}`, { token });
}

export async function apiGetBusinessVisitors(
  businessId: string,
  token: string
): Promise<VisitorResponseRaw[]> {
  return apiFetch(`/api/customers/business/${businessId}/visitors`, { token });
}

// ─── Staff ───────────────────────────────────────────────────────────────────

export interface StaffResponse {
  id: string;
  user_id: string;
  business_id: string;
  role: string;
  created_at: string;
  user_name?: string;
  user_email?: string;
  user_phone?: string | null;
}

export async function apiGetBusinessStaff(
  businessId: string,
  token: string
): Promise<StaffResponse[]> {
  return apiFetch(`/api/staff/business/${businessId}`, { token });
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface BusinessDashboardStats {
  today_reservations: number;
  pending_requests: number;
  today_guest_count: number;
  status_breakdown: {
    confirmed: number;
    pending: number;
    cancelled: number;
    completed: number;
  };
  reservations_by_type: Array<{
    name: string;
    color: string;
    count: number;
  }>;
  daily_by_type: Array<{
    day: string;
    [serviceTypeName: string]: string | number;
  }>;
  upcoming_reservations: Array<{
    id: string;
    time: string;
    guests: number;
    status: string;
    service_type_id: string;
    customer_id: string;
  }>;
  month_change: number;
  /** Bar-wide operational snapshot; keys present only for enabled modules. */
  ops?: {
    orders_today?: number;
    revenue_today?: number;
    open_tabs?: number;
    queue_waiting?: number;
    items_below_par?: number;
  };
}

export async function apiGetBusinessStats(
  businessId: string,
  token: string
): Promise<BusinessDashboardStats> {
  return apiFetch(`/api/analytics/business/${businessId}`, { token });
}

export async function apiGetBusinessKpis(
  businessId: string,
  token: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return apiFetch(`/api/analytics/business/${businessId}/kpis`, { token });
}

export async function apiGetHighRiskReservations(
  businessId: string,
  token: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  return apiFetch(`/api/analytics/business/${businessId}/high-risk`, { token });
}

// ─── Health ──────────────────────────────────────────────────────────────────

export async function apiHealthCheck(): Promise<{ status: string; environment: string }> {
  return apiFetch("/api/health");
}
