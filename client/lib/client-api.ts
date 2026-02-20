import { Business, ServiceType, Reservation, FormFieldDefinition } from "@/types";

/**
 * Client-side API calls.
 *
 * - Public endpoints (GET businesses, service types) go through the Next.js
 *   rewrite at /api/backend/... (no auth needed).
 * - Authenticated endpoints (mutations, user-specific data) go through the
 *   proxy at /api/proxy/... which reads the JWT from the httpOnly cookie and
 *   forwards it as an Authorization header to FastAPI.
 */

const BACKEND_PREFIX = "/api/backend";
const AUTH_PREFIX = "/api/proxy";

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function clientFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_PREFIX}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...((options?.headers as Record<string, string>) || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || response.statusText);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

async function authFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${AUTH_PREFIX}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...((options?.headers as Record<string, string>) || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || response.statusText);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

// ─── Transform helpers (snake_case → camelCase) ─────────────────────────────

function toBusiness(b: Record<string, unknown>): Business {
  return {
    id: b.id as string,
    name: b.name as string,
    slug: b.slug as string,
    email: b.email as string,
    phone: b.phone as string,
    address: (b.address as string) || undefined,
    description: (b.description as string) || undefined,
    image: (b.image as string) || undefined,
    website: (b.website as string) || undefined,
    tags: (b.tags as string[]) || undefined,
    createdAt: b.created_at as string,
    maxGuests: b.max_guests as number,
    reservationTime: b.reservation_time as number,
    timeSlotInterval: b.time_slot_interval as number,
    advanceBookingDays: b.advance_booking_days as number,
    operatingHours: b.operating_hours as Business["operatingHours"],
  };
}

function toFormField(f: Record<string, unknown>): FormFieldDefinition {
  return {
    id: f.id as string,
    label: f.label as string,
    type: f.type as FormFieldDefinition["type"],
    required: f.required as boolean,
    placeholder: (f.placeholder as string) || undefined,
    options: (f.options as string[]) || undefined,
    min: (f.min as number) ?? undefined,
    max: (f.max as number) ?? undefined,
    maxLength: (f.max_length as number) ?? undefined,
    order: f.order as number,
    system: f.system as boolean,
  };
}

function toServiceType(st: Record<string, unknown>): ServiceType {
  const rawFields = st.form_fields as Record<string, unknown>[] | null;
  return {
    id: st.id as string,
    businessId: st.business_id as string,
    name: st.name as string,
    description: (st.description as string) || undefined,
    capacity: st.capacity as number,
    maxConcurrentBookings: (st.max_concurrent_bookings as number) || undefined,
    requiresPayment: st.requires_payment as boolean,
    amount: (st.amount as number) || undefined,
    duration: (st.duration as number) || undefined,
    color: st.color as string,
    displayOrder: (st.display_order as number) || undefined,
    image: (st.image as string) || undefined,
    formFields: rawFields ? rawFields.map(toFormField) : undefined,
    createdAt: st.created_at as string,
    updatedAt: st.updated_at as string,
  };
}

function toReservation(r: Record<string, unknown>): Reservation {
  return {
    id: r.id as string,
    businessId: r.business_id as string,
    customerId: r.customer_id as string,
    serviceTypeId: r.service_type_id as string,
    time: r.time as string,
    phone: r.phone as string,
    email: r.email as string,
    note: (r.note as string) || undefined,
    status: r.status as Reservation["status"],
    guests: r.guests as number,
    paymentAmount: (r.payment_amount as number) || undefined,
    paymentStatus: (r.payment_status as Reservation["paymentStatus"]) || undefined,
    stripePaymentIntentId: (r.stripe_payment_intent_id as string) || undefined,
    customFields: (r.custom_fields as Record<string, unknown>) || undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ─── Public endpoints (no auth needed) ───────────────────────────────────────

export async function clientGetBusinesses(): Promise<Business[]> {
  const data = await clientFetch<Record<string, unknown>[]>("/businesses");
  return data.map(toBusiness);
}

export async function clientGetBusiness(id: string): Promise<Business | null> {
  try {
    const data = await clientFetch<Record<string, unknown>>(`/businesses/${id}`);
    return toBusiness(data);
  } catch {
    return null;
  }
}

export async function clientGetBusinessBySlug(slug: string): Promise<Business | null> {
  try {
    const data = await clientFetch<Record<string, unknown>>(`/businesses/slug/${slug}`);
    return toBusiness(data);
  } catch {
    return null;
  }
}

export async function clientGetServiceTypesByBusiness(
  businessId: string
): Promise<ServiceType[]> {
  const data = await clientFetch<Record<string, unknown>[]>(
    `/service-types/business/${businessId}`
  );
  return data.map(toServiceType);
}

export async function clientGetServiceType(id: string): Promise<ServiceType | null> {
  try {
    const data = await clientFetch<Record<string, unknown>>(`/service-types/${id}`);
    return toServiceType(data);
  } catch {
    return null;
  }
}

// ─── Authenticated: User profile & account ────────────────────────────────────

export async function clientUpdateProfile(data: {
  name?: string;
  phone?: string;
  avatar?: string;
}): Promise<Record<string, unknown>> {
  return authFetch("/auth/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function clientChangeEmail(data: {
  new_email: string;
  password: string;
}): Promise<{ message: string }> {
  return authFetch("/auth/change-email", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function clientChangePassword(data: {
  current_password: string;
  new_password: string;
}): Promise<{ message: string }> {
  return authFetch("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function clientDisableAccount(): Promise<{ message: string }> {
  return authFetch("/auth/disable-account", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// ─── Authenticated: Business mutations ───────────────────────────────────────

export async function clientUpdateBusiness(
  id: string,
  data: Partial<{
    name: string;
    email: string;
    phone: string;
    address: string;
    description: string;
    image: string;
    website: string;
    tags: string[];
    maxGuests: number;
    reservationTime: number;
    timeSlotInterval: number;
    advanceBookingDays: number;
    operatingHours: Record<string, unknown>;
  }>
): Promise<Business> {
  const apiData: Record<string, unknown> = {};
  if (data.name !== undefined) apiData.name = data.name;
  if (data.email !== undefined) apiData.email = data.email;
  if (data.phone !== undefined) apiData.phone = data.phone;
  if (data.address !== undefined) apiData.address = data.address;
  if (data.description !== undefined) apiData.description = data.description;
  if (data.image !== undefined) apiData.image = data.image;
  if (data.website !== undefined) apiData.website = data.website;
  if (data.tags !== undefined) apiData.tags = data.tags;
  if (data.maxGuests !== undefined) apiData.max_guests = data.maxGuests;
  if (data.reservationTime !== undefined) apiData.reservation_time = data.reservationTime;
  if (data.timeSlotInterval !== undefined) apiData.time_slot_interval = data.timeSlotInterval;
  if (data.advanceBookingDays !== undefined) apiData.advance_booking_days = data.advanceBookingDays;
  if (data.operatingHours !== undefined) apiData.operating_hours = data.operatingHours;

  const result = await authFetch<Record<string, unknown>>(`/businesses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(apiData),
  });
  return toBusiness(result);
}

// ─── Public: Reservation creation (no auth) ──────────────────────────────────

export async function clientCreatePublicReservation(data: {
  businessId: string;
  serviceTypeId: string;
  time: string;
  name: string;
  phone: string;
  email: string;
  note?: string;
  guests: number;
  customFields?: Record<string, unknown>;
}): Promise<Reservation> {
  const apiData: Record<string, unknown> = {
    business_id: data.businessId,
    service_type_id: data.serviceTypeId,
    time: data.time,
    name: data.name,
    phone: data.phone,
    email: data.email,
    note: data.note,
    guests: data.guests,
  };
  if (data.customFields) {
    apiData.custom_fields = data.customFields;
  }

  const result = await clientFetch<Record<string, unknown>>("/reservations/public", {
    method: "POST",
    body: JSON.stringify(apiData),
  });
  return toReservation(result);
}

// ─── Authenticated: Reservation mutations ────────────────────────────────────

export async function clientCreateReservation(data: {
  businessId: string;
  serviceTypeId: string;
  time: string;
  phone: string;
  email: string;
  note?: string;
  guests: number;
  paymentAmount?: number;
  paymentStatus?: string;
}): Promise<Reservation> {
  const apiData = {
    business_id: data.businessId,
    service_type_id: data.serviceTypeId,
    time: data.time,
    phone: data.phone,
    email: data.email,
    note: data.note,
    guests: data.guests,
    payment_amount: data.paymentAmount,
    payment_status: data.paymentStatus,
  };

  const result = await authFetch<Record<string, unknown>>("/reservations", {
    method: "POST",
    body: JSON.stringify(apiData),
  });
  return toReservation(result);
}

export async function clientUpdateReservation(
  id: string,
  data: Partial<{
    serviceTypeId: string;
    time: string;
    phone: string;
    email: string;
    note: string;
    status: string;
    guests: number;
  }>
): Promise<Reservation> {
  const apiData: Record<string, unknown> = {};
  if (data.serviceTypeId !== undefined) apiData.service_type_id = data.serviceTypeId;
  if (data.time !== undefined) apiData.time = data.time;
  if (data.phone !== undefined) apiData.phone = data.phone;
  if (data.email !== undefined) apiData.email = data.email;
  if (data.note !== undefined) apiData.note = data.note;
  if (data.status !== undefined) apiData.status = data.status;
  if (data.guests !== undefined) apiData.guests = data.guests;

  const result = await authFetch<Record<string, unknown>>(`/reservations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(apiData),
  });
  return toReservation(result);
}

export async function clientDeleteReservation(id: string): Promise<void> {
  await authFetch(`/reservations/${id}`, { method: "DELETE" });
}

// ─── Authenticated: Service Type mutations ───────────────────────────────────

export async function clientCreateServiceType(data: {
  businessId: string;
  name: string;
  description?: string;
  capacity: number;
  maxConcurrentBookings?: number;
  requiresPayment: boolean;
  amount?: number;
  duration?: number;
  color: string;
  displayOrder?: number;
  image?: string;
  formFields?: FormFieldDefinition[];
}): Promise<ServiceType> {
  const apiData: Record<string, unknown> = {
    business_id: data.businessId,
    name: data.name,
    description: data.description,
    capacity: data.capacity,
    max_concurrent_bookings: data.maxConcurrentBookings,
    requires_payment: data.requiresPayment,
    amount: data.amount,
    duration: data.duration,
    color: data.color,
    display_order: data.displayOrder,
    image: data.image,
  };
  if (data.formFields !== undefined) {
    apiData.form_fields = data.formFields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      placeholder: f.placeholder,
      options: f.options,
      min: f.min,
      max: f.max,
      max_length: f.maxLength,
      order: f.order,
      system: f.system,
    }));
  }

  const result = await authFetch<Record<string, unknown>>("/service-types", {
    method: "POST",
    body: JSON.stringify(apiData),
  });
  return toServiceType(result);
}

export async function clientUpdateServiceType(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    capacity: number;
    maxConcurrentBookings: number;
    requiresPayment: boolean;
    amount: number;
    duration: number;
    color: string;
    displayOrder: number;
    image: string;
    formFields: FormFieldDefinition[];
  }>
): Promise<ServiceType> {
  const apiData: Record<string, unknown> = {};
  if (data.name !== undefined) apiData.name = data.name;
  if (data.description !== undefined) apiData.description = data.description;
  if (data.capacity !== undefined) apiData.capacity = data.capacity;
  if (data.maxConcurrentBookings !== undefined) apiData.max_concurrent_bookings = data.maxConcurrentBookings;
  if (data.requiresPayment !== undefined) apiData.requires_payment = data.requiresPayment;
  if (data.amount !== undefined) apiData.amount = data.amount;
  if (data.duration !== undefined) apiData.duration = data.duration;
  if (data.color !== undefined) apiData.color = data.color;
  if (data.displayOrder !== undefined) apiData.display_order = data.displayOrder;
  if (data.image !== undefined) apiData.image = data.image;
  if (data.formFields !== undefined) {
    apiData.form_fields = data.formFields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      placeholder: f.placeholder,
      options: f.options,
      min: f.min,
      max: f.max,
      max_length: f.maxLength,
      order: f.order,
      system: f.system,
    }));
  }

  const result = await authFetch<Record<string, unknown>>(`/service-types/${id}`, {
    method: "PATCH",
    body: JSON.stringify(apiData),
  });
  return toServiceType(result);
}

export async function clientDeleteServiceType(id: string): Promise<void> {
  await authFetch(`/service-types/${id}`, { method: "DELETE" });
}

// ─── Authenticated: Staff mutations ──────────────────────────────────────────

export interface StaffMember {
  id: string;
  userId: string;
  businessId: string;
  role: string;
  createdAt: string;
}

function toStaffMember(s: Record<string, unknown>): StaffMember {
  return {
    id: s.id as string,
    userId: s.user_id as string,
    businessId: s.business_id as string,
    role: s.role as string,
    createdAt: s.created_at as string,
  };
}

export async function clientCreateStaff(data: {
  userId: string;
  businessId: string;
  role?: string;
}): Promise<StaffMember> {
  const apiData = {
    user_id: data.userId,
    business_id: data.businessId,
    role: data.role || "staff",
  };

  const result = await authFetch<Record<string, unknown>>("/staff", {
    method: "POST",
    body: JSON.stringify(apiData),
  });
  return toStaffMember(result);
}

export async function clientUpdateStaff(
  id: string,
  data: Partial<{ role: string }>
): Promise<StaffMember> {
  const result = await authFetch<Record<string, unknown>>(`/staff/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return toStaffMember(result);
}

export async function clientDeleteStaff(id: string): Promise<void> {
  await authFetch(`/staff/${id}`, { method: "DELETE" });
}
