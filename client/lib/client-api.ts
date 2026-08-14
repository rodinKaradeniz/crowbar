import {
  Availability,
  BookingOperatingHoursPreview,
  BookingSchedule,
  BookingScheduleCollection,
  BookingScheduleDraft,
  Business,
  HappyHourWindow,
  FloorPlanArea,
  FloorPlanAssignment,
  FloorPlanBoard,
  FloorPlanCombination,
  FloorPlanSettings,
  FloorPlanSeating,
  FloorPlanTable,
  GuestProfile,
  GuestListItem,
  HighRiskReservation,
  InventoryItem,
  LibraryItem,
  Menu,
  MenuCategory,
  MenuItem,
  Modifier,
  ModifierGroup,
  MeContext,
  Notification,
  OperationalKpis,
  Order,
  QueueEntry,
  QueueStatus,
  MenuItemStockInfo,
  RecipeIngredient,
  Reservation,
  ReservationWaitlistEntry,
  ServiceType,
  StockMovement,
  Tab,
  TabSettledMethod,
  WasteReason,
} from "@/types";
import { toMoney, toOptionalMoney } from "@/lib/money";

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

interface ErrorPayload {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  detail?: unknown;
}

export class ClientApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown = null,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

function toClientApiError(status: number, statusText: string, body: ErrorPayload) {
  const nested =
    body.detail && typeof body.detail === "object"
      ? (body.detail as ErrorPayload)
      : null;
  const payload = nested ?? body;
  const message =
    typeof payload.message === "string"
      ? payload.message
      : typeof body.detail === "string"
        ? body.detail
        : statusText || "Request failed";
  return new ClientApiError(
    status,
    typeof payload.code === "string" ? payload.code : "ERROR",
    message,
    payload.details ?? null,
  );
}

async function clientFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_PREFIX}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...((options?.headers as Record<string, string>) || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as ErrorPayload;
    throw toClientApiError(response.status, response.statusText, errorBody);
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
    const errorBody = (await response.json().catch(() => ({}))) as ErrorPayload;
    throw toClientApiError(response.status, response.statusText, errorBody);
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
    timezone: (b.timezone as string) || "UTC",
    legalDrinkingAge: (b.legal_drinking_age as number) ?? 18,
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
    enabledModules: (b.enabled_modules as string[]) ?? [],
    onboardingComplete: (b.onboarding_complete as boolean) ?? false,
    notificationChannels: (b.notification_channels as string[]) ?? ["email"],
    isAcceptingOrders: (b.is_accepting_orders as boolean) ?? true,
    publicReservationsEnabled: (b.public_reservations_enabled as boolean) ?? true,
  };
}

function toServiceType(st: Record<string, unknown>): ServiceType {
  return {
    id: st.id as string,
    businessId: st.business_id as string,
    name: st.name as string,
    description: (st.description as string) || undefined,
    capacity: st.capacity as number,
    maxConcurrentBookings: (st.max_concurrent_bookings as number | null) ?? undefined,
    availabilityResourceMode: (st.availability_resource_mode as ServiceType["availabilityResourceMode"]) ?? "legacy",
    reservableCoverCapacity: (st.reservable_cover_capacity as number | null) ?? undefined,
    resourceTurnBufferMinutes: (st.resource_turn_buffer_minutes as number) ?? 0,
    isPendingEnabled: (st.is_pending_enabled as boolean) ?? true,
    duration: (st.duration as number) || undefined,
    color: st.color as string,
    displayOrder: (st.display_order as number) || undefined,
    image: (st.image as string) || undefined,
    createdAt: st.created_at as string,
    updatedAt: st.updated_at as string,
  };
}

function toNotification(n: Record<string, unknown>): Notification {
  return {
    id: n.id as string,
    userId: n.user_id as string,
    businessId: n.business_id as string,
    kind: n.kind as string,
    title: n.title as string,
    body: n.body as string,
    payload: (n.payload as Record<string, unknown>) || {},
    readAt: (n.read_at as string) || null,
    createdAt: n.created_at as string,
    sourceType: (n.source_type as string) || undefined,
  };
}

function toReservation(r: Record<string, unknown>): Reservation {
  return {
    id: r.id as string,
    businessId: r.business_id as string,
    customerId: r.customer_id as string,
    serviceTypeId: r.service_type_id as string,
    time: r.time as string,
    endsAt: r.ends_at as string,
    phone: (r.phone as string | null) ?? undefined,
    email: (r.email as string | null) ?? undefined,
    note: (r.note as string) || undefined,
    status: r.status as Reservation["status"],
    guests: r.guests as number,
    availabilityOverrideBy:
      (r.availability_override_by as string) || undefined,
    availabilityOverrideActorName:
      (r.availability_override_actor_name as string) || undefined,
    availabilityOverrideReason:
      (r.availability_override_reason as string) || undefined,
    availabilityOverriddenAt:
      (r.availability_overridden_at as string) || undefined,
    cancelledAt: (r.cancelled_at as string) || undefined,
    cancelledBy: (r.cancelled_by as Reservation["cancelledBy"]) || undefined,
    cancelledLate: (r.cancelled_late as boolean | null) ?? undefined,
    noShowAt: (r.no_show_at as string) || undefined,
    noShowNote: (r.no_show_note as string) || undefined,
    reconfirmedAt: (r.reconfirmed_at as string) || undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toReservationWaitlistEntry(entry: Record<string, unknown>): ReservationWaitlistEntry {
  return {
    id: entry.id as string, businessId: entry.business_id as string,
    serviceTypeId: entry.service_type_id as string, customerId: entry.customer_id as string,
    requestedStartsAt: entry.requested_starts_at as string, flexibleUntil: entry.flexible_until as string,
    guests: entry.guests as number, status: entry.status as ReservationWaitlistEntry["status"],
    offeredAt: (entry.offered_at as string) || undefined,
    offeredReservationTime: (entry.offered_reservation_time as string) || undefined,
    offerExpiresAt: (entry.offer_expires_at as string) || undefined,
    acceptedAt: (entry.accepted_at as string) || undefined,
    createdAt: entry.created_at as string, updatedAt: entry.updated_at as string,
  };
}

function toGuestProfile(value: Record<string, unknown>): GuestProfile {
  const tags = (value.tags as Record<string, unknown>[] | undefined) ?? [];
  const notes = (value.notes as Record<string, unknown>[] | undefined) ?? [];
  const consents = (value.consents as Record<string, unknown>[] | undefined) ?? [];
  const timeline = (value.timeline as Record<string, unknown>[] | undefined) ?? [];
  return {
    id: value.id as string,
    businessId: value.business_id as string,
    name: (value.name as string | null) ?? undefined,
    phone: (value.phone as string | null) ?? undefined,
    email: (value.email as string | null) ?? undefined,
    dateOfBirth: (value.date_of_birth as string | null) ?? undefined,
    preferences: (value.preferences as string | null) ?? undefined,
    dietaryDetails: (value.dietary_details as string | null) ?? undefined,
    dietaryDetailsSource: (value.dietary_details_source as string | null) ?? undefined,
    dietaryDetailsRecordedAt: (value.dietary_details_recorded_at as string | null) ?? undefined,
    anonymizedAt: (value.anonymized_at as string | null) ?? undefined,
    tags: tags.map((tag) => ({ id: tag.id as string, name: tag.name as string, createdBy: (tag.created_by as string | null) ?? undefined, createdAt: tag.created_at as string })),
    notes: notes.map((note) => ({ id: note.id as string, title: note.title as string, body: note.body as string, createdBy: (note.created_by as string | null) ?? undefined, updatedBy: (note.updated_by as string | null) ?? undefined, createdAt: note.created_at as string, updatedAt: note.updated_at as string })),
    consents: consents.map((consent) => ({ channel: consent.channel as "email" | "sms", isConsented: consent.is_consented as boolean, source: consent.source as string, noticeVersion: consent.notice_version as string, capturedAt: consent.captured_at as string, withdrawnAt: (consent.withdrawn_at as string | null) ?? undefined })),
    timeline: timeline.map((entry) => ({ id: entry.id as string, kind: entry.kind as GuestProfile["timeline"][number]["kind"], occurredAt: entry.occurred_at as string, title: entry.title as string, detail: (entry.detail as string | null) ?? undefined, amount: entry.amount === null || entry.amount === undefined ? undefined : toMoney(entry.amount), status: (entry.status as string | null) ?? undefined })),
  };
}

function toAvailability(data: Record<string, unknown>): Availability {
  const dates = data.dates as Array<Record<string, unknown>>;
  return {
    businessId: data.business_id as string,
    serviceTypeId: data.service_type_id as string,
    timezone: data.timezone as string,
    durationMinutes: data.duration_minutes as number,
    slotIntervalMinutes: data.slot_interval_minutes as number,
    maxPartySize: data.max_party_size as number,
    dates: dates.map((item) => ({
      date: item.date as string,
      slots: (item.slots as Array<Record<string, unknown>>).map((slot) => ({
        startsAt: slot.starts_at as string,
        endsAt: slot.ends_at as string,
      })),
    })),
  };
}

function toBookingSchedule(data: Record<string, unknown>): BookingSchedule {
  const wallTime = (value: unknown) => String(value).slice(0, 5);
  const windows = data.windows as Array<Record<string, unknown>>;
  const exceptions = data.exceptions as Array<Record<string, unknown>>;
  return {
    id: data.id as string,
    businessId: data.business_id as string,
    serviceTypeId: (data.service_type_id as string) || undefined,
    minimumNoticeMinutes: data.minimum_notice_minutes as number,
    advanceBookingDays: data.advance_booking_days as number,
    slotIntervalMinutes: data.slot_interval_minutes as number,
    defaultDurationMinutes: data.default_duration_minutes as number,
    cancellationWindowMinutes: data.cancellation_window_minutes as number,
    arrivalGracePeriodMinutes: data.arrival_grace_period_minutes as number,
    reminderEnabled: data.reminder_enabled as boolean,
    reminderLeadMinutes: data.reminder_lead_minutes as number,
    reconfirmationEnabled: data.reconfirmation_enabled as boolean,
    windows: windows.map((window) => ({
      id: window.id as string | undefined,
      weekday: window.weekday as number,
      startTime: wallTime(window.start_time),
      endTime: wallTime(window.end_time),
      endsNextDay: window.ends_next_day as boolean,
      createdAt: window.created_at as string | undefined,
      updatedAt: window.updated_at as string | undefined,
    })),
    exceptions: exceptions.map((exception) => ({
      id: exception.id as string | undefined,
      localDate: exception.local_date as string,
      isClosed: exception.is_closed as boolean,
      windows: (exception.windows as Array<Record<string, unknown>>).map(
        (window) => ({
          id: window.id as string | undefined,
          startTime: wallTime(window.start_time),
          endTime: wallTime(window.end_time),
          endsNextDay: window.ends_next_day as boolean,
          createdAt: window.created_at as string | undefined,
          updatedAt: window.updated_at as string | undefined,
        }),
      ),
      createdAt: exception.created_at as string | undefined,
      updatedAt: exception.updated_at as string | undefined,
    })),
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

function bookingSchedulePayload(data: BookingScheduleDraft) {
  return {
    minimum_notice_minutes: data.minimumNoticeMinutes,
    advance_booking_days: data.advanceBookingDays,
    slot_interval_minutes: data.slotIntervalMinutes,
    default_duration_minutes: data.defaultDurationMinutes,
    cancellation_window_minutes: data.cancellationWindowMinutes,
    arrival_grace_period_minutes: data.arrivalGracePeriodMinutes,
    reminder_enabled: data.reminderEnabled,
    reminder_lead_minutes: data.reminderLeadMinutes,
    reconfirmation_enabled: data.reconfirmationEnabled,
    windows: data.windows.map((window) => ({
      weekday: window.weekday,
      start_time: window.startTime,
      end_time: window.endTime,
      ends_next_day: window.endsNextDay,
    })),
    exceptions: data.exceptions.map((exception) => ({
      local_date: exception.localDate,
      is_closed: exception.isClosed,
      windows: exception.windows.map((window) => ({
        start_time: window.startTime,
        end_time: window.endTime,
        ends_next_day: window.endsNextDay,
      })),
    })),
  };
}

// ─── Public endpoints (no auth needed) ───────────────────────────────────────

export async function clientGetBusinesses(): Promise<Business[]> {
  const data = await clientFetch<Record<string, unknown>[]>("/businesses");
  return data.map(toBusiness);
}

export async function clientGetBusiness(id: string): Promise<Business | null> {
  try {
    const data = await authFetch<Record<string, unknown>>("/businesses/current");
    if (data.id !== id) return null;
    return toBusiness(data);
  } catch {
    return null;
  }
}

export async function clientGetBusinessBySlug(
  slug: string,
): Promise<Business | null> {
  try {
    const data = await clientFetch<Record<string, unknown>>(
      `/businesses/slug/${slug}`,
    );
    return toBusiness(data);
  } catch {
    return null;
  }
}

export async function clientGetServiceTypesByBusiness(
  businessId: string,
): Promise<ServiceType[]> {
  const data = await clientFetch<Record<string, unknown>[]>(
    `/service-types/business/${businessId}`,
  );
  return data.map(toServiceType);
}

export async function clientGetServiceType(
  id: string,
): Promise<ServiceType | null> {
  try {
    const data = await clientFetch<Record<string, unknown>>(
      `/service-types/${id}`,
    );
    return toServiceType(data);
  } catch {
    return null;
  }
}

export async function clientGetAvailability(data: {
  businessId: string;
  serviceTypeId: string;
  startDate: string;
  days?: number;
  guests: number;
  signal?: AbortSignal;
}): Promise<Availability> {
  const params = new URLSearchParams({
    service_type_id: data.serviceTypeId,
    start_date: data.startDate,
    days: String(data.days ?? 1),
    guests: String(data.guests),
  });
  const result = await clientFetch<Record<string, unknown>>(
    `/availability/business/${data.businessId}?${params.toString()}`,
    { signal: data.signal },
  );
  return toAvailability(result);
}

// ─── Authenticated: Booking schedule management ─────────────────────────────

export async function clientGetBookingSchedules(): Promise<BookingScheduleCollection> {
  const data = await authFetch<Record<string, unknown>>("/booking-schedules");
  return {
    defaultSchedule: toBookingSchedule(
      data.default_schedule as Record<string, unknown>,
    ),
    serviceOverrides: (
      data.service_overrides as Array<Record<string, unknown>>
    ).map(toBookingSchedule),
  };
}

export async function clientReplaceDefaultBookingSchedule(
  data: BookingScheduleDraft,
): Promise<BookingSchedule> {
  const result = await authFetch<Record<string, unknown>>(
    "/booking-schedules/default",
    { method: "PUT", body: JSON.stringify(bookingSchedulePayload(data)) },
  );
  return toBookingSchedule(result);
}

export async function clientReplaceServiceBookingSchedule(
  serviceTypeId: string,
  data: BookingScheduleDraft,
): Promise<BookingSchedule> {
  const result = await authFetch<Record<string, unknown>>(
    `/booking-schedules/service-types/${serviceTypeId}`,
    { method: "PUT", body: JSON.stringify(bookingSchedulePayload(data)) },
  );
  return toBookingSchedule(result);
}

export async function clientDeleteServiceBookingSchedule(
  serviceTypeId: string,
): Promise<void> {
  await authFetch(`/booking-schedules/service-types/${serviceTypeId}`, {
    method: "DELETE",
  });
}

export async function clientGetOperatingHoursPreview(): Promise<BookingOperatingHoursPreview> {
  const result = await authFetch<Record<string, unknown>>(
    "/booking-schedules/default/operating-hours-preview",
  );
  const mapWindow = (window: Record<string, unknown>) => ({
    weekday: window.weekday as number,
    startTime: String(window.start_time).slice(0, 5),
    endTime: String(window.end_time).slice(0, 5),
    endsNextDay: window.ends_next_day as boolean,
  });
  return {
    currentWindows: (
      result.current_windows as Array<Record<string, unknown>>
    ).map(mapWindow),
    proposedWindows: (
      result.proposed_windows as Array<Record<string, unknown>>
    ).map(mapWindow),
  };
}

export async function clientCopyOperatingHoursToDefault(): Promise<BookingSchedule> {
  const result = await authFetch<Record<string, unknown>>(
    "/booking-schedules/default/copy-operating-hours",
    { method: "POST" },
  );
  return toBookingSchedule(result);
}

// ─── Authenticated: Notifications ────────────────────────────────────────────

export async function clientGetUnreadNotificationCount(): Promise<number> {
  const { count } = await authFetch<{ count: number }>(
    "/notifications/unread-count",
  );
  return count;
}

export async function clientGetNotifications(options?: {
  limit?: number;
  offset?: number;
}): Promise<Notification[]> {
  const params = new URLSearchParams();
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.offset != null) params.set("offset", String(options.offset));
  const q = params.toString();
  const path = q ? `/notifications?${q}` : "/notifications";
  const data = await authFetch<Record<string, unknown>[]>(path);
  return data.map(toNotification);
}

export async function clientMarkNotificationRead(
  id: string,
): Promise<Notification> {
  const result = await authFetch<Record<string, unknown>>(
    `/notifications/${id}/read`,
    {
      method: "PATCH",
    },
  );
  return toNotification(result);
}

export async function clientMarkAllNotificationsRead(): Promise<void> {
  await authFetch("/notifications/read-all", { method: "POST" });
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
    timezone: string;
    legalDrinkingAge: number;
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
    publicReservationsEnabled: boolean;
  }>,
): Promise<Business> {
  const apiData: Record<string, unknown> = {};
  if (data.name !== undefined) apiData.name = data.name;
  if (data.email !== undefined) apiData.email = data.email;
  if (data.phone !== undefined) apiData.phone = data.phone;
  if (data.timezone !== undefined) apiData.timezone = data.timezone;
  if (data.legalDrinkingAge !== undefined)
    apiData.legal_drinking_age = data.legalDrinkingAge;
  if (data.address !== undefined) apiData.address = data.address;
  if (data.description !== undefined) apiData.description = data.description;
  if (data.image !== undefined) apiData.image = data.image;
  if (data.website !== undefined) apiData.website = data.website;
  if (data.tags !== undefined) apiData.tags = data.tags;
  if (data.maxGuests !== undefined) apiData.max_guests = data.maxGuests;
  if (data.reservationTime !== undefined)
    apiData.reservation_time = data.reservationTime;
  if (data.timeSlotInterval !== undefined)
    apiData.time_slot_interval = data.timeSlotInterval;
  if (data.advanceBookingDays !== undefined)
    apiData.advance_booking_days = data.advanceBookingDays;
  if (data.operatingHours !== undefined)
    apiData.operating_hours = data.operatingHours;
  if (data.publicReservationsEnabled !== undefined)
    apiData.public_reservations_enabled = data.publicReservationsEnabled;

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
  marketingEmailOptIn?: boolean;
  marketingSmsOptIn?: boolean;
  idempotencyKey: string;
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
    marketing_email_opt_in: data.marketingEmailOptIn ?? false,
    marketing_sms_opt_in: data.marketingSmsOptIn ?? false,
    idempotency_key: data.idempotencyKey,
  };

  const result = await clientFetch<Record<string, unknown>>(
    "/reservations/public",
    {
      method: "POST",
      body: JSON.stringify(apiData),
    },
  );
  return toReservation(result);
}

export async function clientGetPublicManagedReservation(token: string): Promise<Reservation> {
  return toReservation(await clientFetch<Record<string, unknown>>(`/reservations/public/manage/${encodeURIComponent(token)}`));
}

export async function clientCancelPublicReservation(token: string): Promise<Reservation> {
  return toReservation(await clientFetch<Record<string, unknown>>(`/reservations/public/manage/${encodeURIComponent(token)}/cancel`, { method: "POST" }));
}

export async function clientReconfirmPublicReservation(token: string): Promise<Reservation> {
  return toReservation(await clientFetch<Record<string, unknown>>(`/reservations/public/manage/${encodeURIComponent(token)}/reconfirm`, { method: "POST" }));
}

export async function clientReschedulePublicReservation(token: string, data: {
  serviceTypeId: string; time: string; guests: number;
}): Promise<Reservation> {
  return toReservation(await clientFetch<Record<string, unknown>>(`/reservations/public/manage/${encodeURIComponent(token)}/reschedule`, {
    method: "POST",
    body: JSON.stringify({ service_type_id: data.serviceTypeId, time: data.time, guests: data.guests }),
  }));
}

export async function clientAcceptWaitlistOffer(token: string): Promise<Reservation> {
  return toReservation(await clientFetch<Record<string, unknown>>(`/reservations/waitlist/offers/${encodeURIComponent(token)}/accept`, { method: "POST" }));
}

export interface ReservationWaitlistCreateInput {
  businessId: string; serviceTypeId: string; requestedStartsAt: string; flexibleUntil: string;
  guests: number; name: string; phone: string; email: string;
}

function waitlistPayload(data: ReservationWaitlistCreateInput) {
  return { business_id: data.businessId, service_type_id: data.serviceTypeId,
    requested_starts_at: data.requestedStartsAt, flexible_until: data.flexibleUntil,
    guests: data.guests, name: data.name, phone: data.phone, email: data.email };
}

export async function clientCreatePublicReservationWaitlist(data: ReservationWaitlistCreateInput): Promise<ReservationWaitlistEntry> {
  return toReservationWaitlistEntry(await clientFetch<Record<string, unknown>>( "/reservations/waitlist/public", { method: "POST", body: JSON.stringify(waitlistPayload(data)) }));
}

export async function clientCreateReservationWaitlist(data: ReservationWaitlistCreateInput): Promise<ReservationWaitlistEntry> {
  return toReservationWaitlistEntry(await authFetch<Record<string, unknown>>( "/reservations/waitlist", { method: "POST", body: JSON.stringify(waitlistPayload(data)) }));
}

export async function clientOfferReservationWaitlist(entryId: string, reservationTime: string): Promise<ReservationWaitlistEntry> {
  return toReservationWaitlistEntry(await authFetch<Record<string, unknown>>( `/reservations/waitlist/${entryId}/offer`, { method: "POST", body: JSON.stringify({ reservation_time: reservationTime }) }));
}

// ─── Guest CRM ──────────────────────────────────────────────────────────────

export async function clientGetGuestProfile(customerId: string): Promise<GuestProfile> {
  return toGuestProfile(await authFetch<Record<string, unknown>>(`/customers/${customerId}`));
}

export async function clientListGuests(): Promise<GuestListItem[]> {
  const result = await authFetch<Record<string, unknown>[]>("/customers");
  return result.map((guest) => ({ id: guest.id as string, name: (guest.name as string | null) ?? undefined, phone: (guest.phone as string | null) ?? undefined, email: (guest.email as string | null) ?? undefined }));
}

export async function clientUpdateGuestProfile(customerId: string, data: {
  name?: string; email?: string; dateOfBirth?: string | null; preferences?: string | null;
  dietaryDetails?: string | null; saveDietaryDetails?: boolean;
}): Promise<GuestProfile> {
  return toGuestProfile(await authFetch<Record<string, unknown>>(`/customers/${customerId}`, {
    method: "PATCH", body: JSON.stringify({ name: data.name, email: data.email, date_of_birth: data.dateOfBirth, preferences: data.preferences, dietary_details: data.dietaryDetails, save_dietary_details: data.saveDietaryDetails }),
  }));
}

export async function clientAddGuestTag(customerId: string, name: string) {
  return authFetch(`/customers/${customerId}/tags`, { method: "POST", body: JSON.stringify({ name }) });
}

export async function clientRemoveGuestTag(customerId: string, tagId: string): Promise<void> {
  await authFetch(`/customers/${customerId}/tags/${tagId}`, { method: "DELETE" });
}

export async function clientAddGuestNote(customerId: string, title: string, body: string) {
  return authFetch(`/customers/${customerId}/notes`, { method: "POST", body: JSON.stringify({ title, body }) });
}

export async function clientRequestGuestDeletion(customerId: string): Promise<void> {
  await authFetch(`/customers/${customerId}/data-requests`, { method: "POST", body: JSON.stringify({ request_type: "deletion" }) });
}

export async function clientExportGuest(customerId: string): Promise<GuestProfile> {
  return toGuestProfile(await authFetch<Record<string, unknown>>(`/customers/${customerId}/export`));
}

export async function clientMergeGuest(customerId: string, sourceCustomerId: string): Promise<GuestProfile> {
  return toGuestProfile(await authFetch<Record<string, unknown>>(`/customers/${customerId}/merge`, {
    method: "POST", body: JSON.stringify({ source_customer_id: sourceCustomerId }),
  }));
}

// ─── Authenticated: Reservation mutations ────────────────────────────────────

export async function clientCreateStaffReservation(data: {
  serviceTypeId: string;
  time: string;
  name: string;
  phone: string;
  email: string;
  note?: string;
  guests: number;
  availabilityOverrideReason?: string;
}): Promise<Reservation> {
  const apiData = {
    service_type_id: data.serviceTypeId,
    time: data.time,
    name: data.name,
    phone: data.phone,
    email: data.email,
    note: data.note,
    guests: data.guests,
    availability_override_reason: data.availabilityOverrideReason,
  };

  const result = await authFetch<Record<string, unknown>>("/reservations", {
    method: "POST",
    body: JSON.stringify(apiData),
  });
  return toReservation(result);
}

export async function clientGetStaffReservationAvailability(data: {
  serviceTypeId: string;
  startDate: string;
  days?: number;
  guests: number;
  signal?: AbortSignal;
}): Promise<Availability> {
  const params = new URLSearchParams({
    service_type_id: data.serviceTypeId,
    start_date: data.startDate,
    days: String(data.days ?? 1),
    guests: String(data.guests),
  });
  const result = await authFetch<Record<string, unknown>>(
    `/reservations/availability?${params.toString()}`,
    { signal: data.signal },
  );
  return toAvailability(result);
}

export async function clientGetStaffOverrideTimes(data: {
  serviceTypeId: string;
  localDate: string;
  guests: number;
  signal?: AbortSignal;
}): Promise<Availability> {
  const params = new URLSearchParams({
    service_type_id: data.serviceTypeId,
    local_date: data.localDate,
    guests: String(data.guests),
  });
  const result = await authFetch<Record<string, unknown>>(
    `/reservations/override-times?${params.toString()}`,
    { signal: data.signal },
  );
  return toAvailability(result);
}

export async function clientUpdateReservation(
  id: string,
  data: Partial<{
    phone: string;
    email: string;
    note: string;
    status: string;
  }>,
): Promise<Reservation> {
  const apiData: Record<string, unknown> = {};
  if (data.phone !== undefined) apiData.phone = data.phone;
  if (data.email !== undefined) apiData.email = data.email;
  if (data.note !== undefined) apiData.note = data.note;
  if (data.status !== undefined) apiData.status = data.status;

  const result = await authFetch<Record<string, unknown>>(
    `/reservations/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(apiData),
    },
  );
  return toReservation(result);
}

export async function clientMarkReservationNoShow(id: string, note?: string): Promise<Reservation> {
  return toReservation(await authFetch<Record<string, unknown>>(`/reservations/${id}/no-show`, {
    method: "POST", body: JSON.stringify({ note }),
  }));
}

export async function clientGetReservationRescheduleAvailability(data: {
  reservationId: string;
  serviceTypeId: string;
  startDate: string;
  days?: number;
  guests: number;
  signal?: AbortSignal;
}): Promise<Availability> {
  const params = new URLSearchParams({
    service_type_id: data.serviceTypeId,
    start_date: data.startDate,
    days: String(data.days ?? 1),
    guests: String(data.guests),
  });
  const result = await authFetch<Record<string, unknown>>(
    `/reservations/${data.reservationId}/availability?${params.toString()}`,
    { signal: data.signal },
  );
  return toAvailability(result);
}

export async function clientRescheduleReservation(
  id: string,
  data: {
    serviceTypeId: string;
    time: string;
    guests: number;
    availabilityOverrideReason?: string;
  },
): Promise<Reservation> {
  const result = await authFetch<Record<string, unknown>>(
    `/reservations/${id}/reschedule`,
    {
      method: "POST",
      body: JSON.stringify({
        service_type_id: data.serviceTypeId,
        time: data.time,
        guests: data.guests,
        availability_override_reason: data.availabilityOverrideReason,
      }),
    },
  );
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
  maxConcurrentBookings?: number | null;
  availabilityResourceMode?: "legacy" | "tables" | "covers";
  reservableCoverCapacity?: number;
  resourceTurnBufferMinutes?: number;
  isPendingEnabled?: boolean;
  duration?: number;
  color: string;
  displayOrder?: number;
  image?: string;
}): Promise<ServiceType> {
  const apiData: Record<string, unknown> = {
    business_id: data.businessId,
    name: data.name,
    description: data.description,
    capacity: data.capacity,
    max_concurrent_bookings: data.maxConcurrentBookings,
    availability_resource_mode: data.availabilityResourceMode ?? "covers",
    reservable_cover_capacity: data.reservableCoverCapacity,
    resource_turn_buffer_minutes: data.resourceTurnBufferMinutes ?? 0,
    is_pending_enabled: data.isPendingEnabled ?? true,
    duration: data.duration,
    color: data.color,
    display_order: data.displayOrder,
    image: data.image,
  };

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
    maxConcurrentBookings: number | null;
    availabilityResourceMode: "legacy" | "tables" | "covers";
    reservableCoverCapacity: number;
    resourceTurnBufferMinutes: number;
    isPendingEnabled: boolean;
    duration: number;
    color: string;
    displayOrder: number;
    image: string;
  }>,
): Promise<ServiceType> {
  const apiData: Record<string, unknown> = {};
  if (data.name !== undefined) apiData.name = data.name;
  if (data.description !== undefined) apiData.description = data.description;
  if (data.capacity !== undefined) apiData.capacity = data.capacity;
  if (data.maxConcurrentBookings !== undefined)
    apiData.max_concurrent_bookings = data.maxConcurrentBookings;
  if (data.availabilityResourceMode !== undefined)
    apiData.availability_resource_mode = data.availabilityResourceMode;
  if (data.reservableCoverCapacity !== undefined)
    apiData.reservable_cover_capacity = data.reservableCoverCapacity;
  if (data.resourceTurnBufferMinutes !== undefined)
    apiData.resource_turn_buffer_minutes = data.resourceTurnBufferMinutes;
  if (data.isPendingEnabled !== undefined)
    apiData.is_pending_enabled = data.isPendingEnabled;
  if (data.duration !== undefined) apiData.duration = data.duration;
  if (data.color !== undefined) apiData.color = data.color;
  if (data.displayOrder !== undefined)
    apiData.display_order = data.displayOrder;
  if (data.image !== undefined) apiData.image = data.image;

  const result = await authFetch<Record<string, unknown>>(
    `/service-types/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(apiData),
    },
  );
  return toServiceType(result);
}

export async function clientDeleteServiceType(id: string): Promise<void> {
  await authFetch(`/service-types/${id}`, { method: "DELETE" });
}

export async function clientGetMeContext(): Promise<MeContext | null> {
  try {
    const data = await authFetch<Record<string, unknown>>("/auth/me/context");
    const biz = data.business as Record<string, unknown>;
    return {
      user: {
        id: (data.user as Record<string, unknown>).id as string,
        email: (data.user as Record<string, unknown>).email as string,
        name: (data.user as Record<string, unknown>).name as string,
        phone: (data.user as Record<string, unknown>).phone as string | undefined,
        avatar: (data.user as Record<string, unknown>).avatar as string | undefined,
        userType: (data.user as Record<string, unknown>).user_type as string,
      },
      business: {
        id: biz.id as string,
        name: biz.name as string,
        slug: biz.slug as string,
        enabledModules: (biz.enabled_modules as string[]) ?? [],
        onboardingComplete: (biz.onboarding_complete as boolean) ?? false,
        notificationChannels: (biz.notification_channels as string[]) ?? ["email"],
        locations: (biz.locations as MeContext["business"]["locations"]) ?? [],
      },
      role: data.role as MeContext["role"],
      permissions: (data.permissions as string[]) ?? [],
      enabledModules: (data.enabled_modules as string[]) ?? [],
    };
  } catch {
    return null;
  }
}

export async function clientCompleteOnboarding(businessId: string): Promise<Business> {
  const result = await authFetch<Record<string, unknown>>(
    `/businesses/${businessId}/onboarding-complete`,
    { method: "PATCH" },
  );
  return toBusiness(result);
}

export async function clientUpdateNotificationChannels(
  businessId: string,
  channels: string[],
): Promise<Business> {
  const result = await authFetch<Record<string, unknown>>(
    `/businesses/${businessId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ notification_channels: channels }),
    },
  );
  return toBusiness(result);
}

export async function clientUpdateEnabledModules(
  businessId: string,
  enabledModules: string[],
): Promise<Business> {
  const result = await authFetch<Record<string, unknown>>(
    `/businesses/${businessId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled_modules: enabledModules }),
    },
  );
  return toBusiness(result);
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

export async function clientUpdateStaff(
  id: string,
  data: Partial<{ role: string }>,
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

// ─── Queue ────────────────────────────────────────────────────────────────────

function toQueueEntry(e: Record<string, unknown>): QueueEntry {
  return {
    id: e.id as string,
    businessId: e.business_id as string,
    sessionToken: e.session_token as string,
    name: e.name as string,
    partySize: e.party_size as number,
    phone: (e.phone as string) || undefined,
    status: e.status as QueueEntry["status"],
    position: (e.position as number) ?? undefined,
    joinedAt: e.joined_at as string,
    calledAt: (e.called_at as string) || undefined,
    seatedAt: (e.seated_at as string) || undefined,
  };
}

function toQueueStatus(s: Record<string, unknown>): QueueStatus {
  return {
    entry: toQueueEntry(s.entry as Record<string, unknown>),
    totalWaiting: s.total_waiting as number,
    estimatedWaitMinutes: (s.estimated_wait_minutes as number) ?? undefined,
  };
}

export async function clientLeaveQueue(
  businessId: string,
  sessionToken: string,
): Promise<void> {
  await clientFetch(
    `/queue/${businessId}/leave?session_token=${encodeURIComponent(sessionToken)}`,
    { method: "POST" },
  );
}

export async function clientJoinQueue(
  businessId: string,
  data: { name: string; partySize: number; phone?: string },
): Promise<QueueStatus> {
  const result = await clientFetch<Record<string, unknown>>(
    `/queue/${businessId}/join`,
    {
      method: "POST",
      body: JSON.stringify({ name: data.name, party_size: data.partySize, phone: data.phone }),
    },
  );
  return toQueueStatus(result);
}

export async function clientGetQueueStatus(
  businessId: string,
  sessionToken: string,
): Promise<QueueStatus> {
  const result = await clientFetch<Record<string, unknown>>(
    `/queue/${businessId}/status?session_token=${encodeURIComponent(sessionToken)}`,
  );
  return toQueueStatus(result);
}

export async function clientGetQueueActiveCount(businessId: string): Promise<number> {
  const result = await authFetch<Record<string, unknown>[]>(`/queue/${businessId}/entries`);
  return result.filter((e) => e.status === "waiting" || e.status === "called").length;
}

export async function clientGetQueueEntries(businessId: string): Promise<QueueEntry[]> {
  const result = await authFetch<Record<string, unknown>[]>(`/queue/${businessId}/entries`);
  return result.map(toQueueEntry);
}

export async function clientNotifyQueueEntry(
  businessId: string,
  entryId: string,
): Promise<QueueEntry> {
  const result = await authFetch<Record<string, unknown>>(
    `/queue/${businessId}/entries/${entryId}/notify`,
    { method: "POST" },
  );
  return toQueueEntry(result);
}

export async function clientRemoveQueueEntry(
  businessId: string,
  entryId: string,
): Promise<void> {
  await authFetch(`/queue/${businessId}/entries/${entryId}`, { method: "DELETE" });
}

// ─── Floor plan ──────────────────────────────────────────────────────────────

function toFloorPlanArea(value: Record<string, unknown>): FloorPlanArea {
  return {
    id: value.id as string,
    businessId: value.business_id as string,
    locationId: value.location_id as string,
    name: value.name as string,
    sortOrder: value.sort_order as number,
    isActive: value.is_active as boolean,
  };
}

function toFloorPlanTable(value: Record<string, unknown>): FloorPlanTable {
  return {
    id: value.id as string,
    businessId: value.business_id as string,
    locationId: value.location_id as string,
    areaId: value.area_id as string,
    label: value.label as string,
    capacity: value.capacity as number,
    shape: value.shape as FloorPlanTable["shape"],
    sortOrder: value.sort_order as number,
    operationalState: value.operational_state as FloorPlanTable["operationalState"],
    operationalStateReason: (value.operational_state_reason as string) || undefined,
    operationalStateUntil: (value.operational_state_until as string) || undefined,
    isActive: value.is_active as boolean,
  };
}

function toFloorPlanCombination(value: Record<string, unknown>): FloorPlanCombination {
  return {
    id: value.id as string,
    businessId: value.business_id as string,
    locationId: value.location_id as string,
    areaId: value.area_id as string,
    name: value.name as string,
    tableIds: value.table_ids as string[],
    capacityOverride: (value.capacity_override as number) ?? undefined,
    effectiveCapacity: value.effective_capacity as number,
    isActive: value.is_active as boolean,
  };
}

function toFloorPlanParty(value: Record<string, unknown>) {
  return {
    sourceType: value.source_type as "reservation" | "queue",
    sourceId: value.source_id as string,
    name: value.name as string,
    partySize: value.party_size as number,
    status: value.status as string,
    startsAt: (value.starts_at as string) || undefined,
    endsAt: (value.ends_at as string) || undefined,
    assignedTableIds: (value.assigned_table_ids as string[]) ?? [],
    customerId: (value.customer_id as string | null) ?? undefined,
    guestContext: value.guest_context ? {
      customerId: (value.guest_context as Record<string, unknown>).customer_id as string,
      tags: ((value.guest_context as Record<string, unknown>).tags as string[]) ?? [],
      dietaryDetails: ((value.guest_context as Record<string, unknown>).dietary_details as string | null) ?? undefined,
      preferences: ((value.guest_context as Record<string, unknown>).preferences as string | null) ?? undefined,
    } : undefined,
  };
}

function toFloorPlanAssignment(value: Record<string, unknown>): FloorPlanAssignment {
  return {
    sourceType: value.source_type as FloorPlanAssignment["sourceType"],
    sourceId: value.source_id as string,
    tableIds: value.table_ids as string[],
    assignedBy: (value.assigned_by as string) || undefined,
    assignedAt: value.assigned_at as string,
    capacity: value.capacity as number,
    capacityOverrideReason: (value.capacity_override_reason as string) || undefined,
  };
}

function toFloorPlanSeating(value: Record<string, unknown>): FloorPlanSeating {
  return {
    seatingId: value.seating_id as string,
    source: toFloorPlanParty(value.source as Record<string, unknown>),
    tableIds: value.table_ids as string[],
    openedAt: value.opened_at as string,
    openTabId: (value.open_tab_id as string) || undefined,
  };
}

function toFloorPlanBoardTable(value: Record<string, unknown>) {
  return {
    id: value.id as string,
    areaId: value.area_id as string,
    label: value.label as string,
    capacity: value.capacity as number,
    shape: value.shape as string,
    sortOrder: value.sort_order as number,
    displayState: value.display_state as FloorPlanBoard["areas"][number]["tables"][number]["displayState"],
    operationalState: value.operational_state as FloorPlanTable["operationalState"],
    operationalStateReason: (value.operational_state_reason as string) || undefined,
    operationalStateUntil: (value.operational_state_until as string) || undefined,
    operationalStateExpired: (value.operational_state_expired as boolean) ?? false,
    activeSeating: value.active_seating
      ? toFloorPlanSeating(value.active_seating as Record<string, unknown>)
      : undefined,
    activeAssignment: value.active_assignment
      ? toFloorPlanParty(value.active_assignment as Record<string, unknown>)
      : undefined,
    nextReservation: value.next_reservation
      ? toFloorPlanParty(value.next_reservation as Record<string, unknown>)
      : undefined,
  };
}

function toFloorPlanBoard(value: Record<string, unknown>): FloorPlanBoard {
  return {
    businessId: value.business_id as string,
    locationId: value.location_id as string,
    timezone: value.timezone as string,
    serviceDate: value.service_date as string,
    startsAt: value.starts_at as string,
    endsAt: value.ends_at as string,
    generatedAt: value.generated_at as string,
    areas: ((value.areas as Record<string, unknown>[]) ?? []).map((area) => ({
      id: area.id as string,
      name: area.name as string,
      sortOrder: area.sort_order as number,
      tables: ((area.tables as Record<string, unknown>[]) ?? []).map(toFloorPlanBoardTable),
    })),
    unassignedReservations: (
      (value.unassigned_reservations as Record<string, unknown>[]) ?? []
    ).map(toFloorPlanParty),
    queueEntries: ((value.queue_entries as Record<string, unknown>[]) ?? []).map(
      toFloorPlanParty,
    ),
  };
}

export async function clientGetFloorPlanBoard(): Promise<FloorPlanBoard> {
  const result = await authFetch<Record<string, unknown>>("/floor-plan/board");
  return toFloorPlanBoard(result);
}

export async function clientGetFloorPlanAreas(): Promise<FloorPlanArea[]> {
  const result = await authFetch<Record<string, unknown>[]>("/floor-plan/areas");
  return result.map(toFloorPlanArea);
}

export async function clientGetFloorPlanTables(): Promise<FloorPlanTable[]> {
  const result = await authFetch<Record<string, unknown>[]>("/floor-plan/tables");
  return result.map(toFloorPlanTable);
}

export async function clientGetFloorPlanCombinations(): Promise<FloorPlanCombination[]> {
  const result = await authFetch<Record<string, unknown>[]>("/floor-plan/combinations");
  return result.map(toFloorPlanCombination);
}

export async function clientGetFloorPlanSettings(): Promise<FloorPlanSettings> {
  const result = await authFetch<Record<string, unknown>>("/floor-plan/settings");
  return {
    serviceDayCutoff: result.service_day_cutoff as string,
    timezone: result.timezone as string,
  };
}

export async function clientCreateFloorPlanArea(data: {
  name: string;
  sortOrder?: number;
}): Promise<FloorPlanArea> {
  const result = await authFetch<Record<string, unknown>>("/floor-plan/areas", {
    method: "POST",
    body: JSON.stringify({ name: data.name, sort_order: data.sortOrder ?? 0 }),
  });
  return toFloorPlanArea(result);
}

export async function clientUpdateFloorPlanArea(
  areaId: string,
  data: Partial<{ name: string; sortOrder: number; isActive: boolean }>,
): Promise<FloorPlanArea> {
  const result = await authFetch<Record<string, unknown>>(`/floor-plan/areas/${areaId}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: data.name,
      sort_order: data.sortOrder,
      is_active: data.isActive,
    }),
  });
  return toFloorPlanArea(result);
}

export async function clientCreateFloorPlanTable(data: {
  areaId: string;
  label: string;
  capacity: number;
  shape: FloorPlanTable["shape"];
  sortOrder?: number;
}): Promise<FloorPlanTable> {
  const result = await authFetch<Record<string, unknown>>("/floor-plan/tables", {
    method: "POST",
    body: JSON.stringify({
      area_id: data.areaId,
      label: data.label,
      capacity: data.capacity,
      shape: data.shape,
      sort_order: data.sortOrder ?? 0,
    }),
  });
  return toFloorPlanTable(result);
}

export async function clientUpdateFloorPlanTable(
  tableId: string,
  data: Partial<{
    areaId: string;
    label: string;
    capacity: number;
    shape: FloorPlanTable["shape"];
    sortOrder: number;
  }>,
): Promise<FloorPlanTable> {
  const result = await authFetch<Record<string, unknown>>(`/floor-plan/tables/${tableId}`, {
    method: "PATCH",
    body: JSON.stringify({
      area_id: data.areaId,
      label: data.label,
      capacity: data.capacity,
      shape: data.shape,
      sort_order: data.sortOrder,
    }),
  });
  return toFloorPlanTable(result);
}

export async function clientUpdateFloorPlanTableState(
  tableId: string,
  data: { state: FloorPlanTable["operationalState"]; reason?: string },
): Promise<FloorPlanTable> {
  const result = await authFetch<Record<string, unknown>>(
    `/floor-plan/tables/${tableId}/state`,
    { method: "PUT", body: JSON.stringify(data) },
  );
  return toFloorPlanTable(result);
}

function toFloorPlanTableQr(value: Record<string, unknown>) {
  return {
    tableId: value.table_id as string,
    label: value.label as string,
    revision: value.revision as number,
    url: value.url as string,
  };
}

export async function clientGetFloorPlanTableQr(tableId: string) {
  const result = await authFetch<Record<string, unknown>>(`/floor-plan/tables/${tableId}/qr`);
  return toFloorPlanTableQr(result);
}

export async function clientRotateFloorPlanTableQr(tableId: string) {
  const result = await authFetch<Record<string, unknown>>(
    `/floor-plan/tables/${tableId}/qr/rotate`,
    { method: "POST" },
  );
  return toFloorPlanTableQr(result);
}

export async function clientArchiveFloorPlanTable(tableId: string): Promise<void> {
  await authFetch(`/floor-plan/tables/${tableId}`, { method: "DELETE" });
}

export async function clientArchiveFloorPlanArea(areaId: string): Promise<void> {
  await authFetch(`/floor-plan/areas/${areaId}`, { method: "DELETE" });
}

export async function clientCreateFloorPlanCombination(data: {
  name: string;
  tableIds: string[];
  capacityOverride?: number;
}): Promise<FloorPlanCombination> {
  const result = await authFetch<Record<string, unknown>>("/floor-plan/combinations", {
    method: "POST",
    body: JSON.stringify({
      name: data.name,
      table_ids: data.tableIds,
      capacity_override: data.capacityOverride,
    }),
  });
  return toFloorPlanCombination(result);
}

export async function clientUpdateFloorPlanCombination(
  combinationId: string,
  data: Partial<{ name: string; tableIds: string[]; capacityOverride: number; isActive: boolean }>,
): Promise<FloorPlanCombination> {
  const result = await authFetch<Record<string, unknown>>(
    `/floor-plan/combinations/${combinationId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: data.name,
        table_ids: data.tableIds,
        capacity_override: data.capacityOverride,
        is_active: data.isActive,
      }),
    },
  );
  return toFloorPlanCombination(result);
}

export async function clientUpdateFloorPlanSettings(
  serviceDayCutoff: string,
): Promise<FloorPlanSettings> {
  const result = await authFetch<Record<string, unknown>>("/floor-plan/settings", {
    method: "PUT",
    body: JSON.stringify({ service_day_cutoff: serviceDayCutoff }),
  });
  return {
    serviceDayCutoff: result.service_day_cutoff as string,
    timezone: result.timezone as string,
  };
}

export async function clientOpenFloorPlanSeating(data: {
  sourceType: "reservation" | "queue";
  sourceId: string;
  tableIds: string[];
  capacityOverrideReason?: string;
}): Promise<void> {
  await authFetch("/floor-plan/seatings", {
    method: "POST",
    body: JSON.stringify({
      source_type: data.sourceType,
      source_id: data.sourceId,
      table_ids: data.tableIds,
      capacity_override_reason: data.capacityOverrideReason,
    }),
  });
}

export async function clientCloseFloorPlanSeating(seatingId: string): Promise<void> {
  await authFetch(`/floor-plan/seatings/${seatingId}/close`, { method: "POST" });
}

export async function clientReplaceFloorPlanAssignment(data: {
  sourceType: "reservation" | "queue";
  sourceId: string;
  tableIds: string[];
  capacityOverrideReason?: string;
}): Promise<void> {
  await authFetch(`/floor-plan/${data.sourceType === "queue" ? "queue" : "reservations"}/${data.sourceId}/tables`, {
    method: "PUT",
    body: JSON.stringify({
      table_ids: data.tableIds,
      capacity_override_reason: data.capacityOverrideReason,
    }),
  });
}

export async function clientGetReservationFloorPlanAssignment(
  reservationId: string,
): Promise<FloorPlanAssignment> {
  const result = await authFetch<Record<string, unknown>>(
    `/floor-plan/reservations/${reservationId}/tables`,
  );
  return toFloorPlanAssignment(result);
}

export async function clientRemoveReservationFloorPlanAssignment(
  reservationId: string,
): Promise<void> {
  await authFetch(`/floor-plan/reservations/${reservationId}/tables`, {
    method: "DELETE",
  });
}

// ─── Ordering: transform helpers ─────────────────────────────────────────────

function toModifier(m: Record<string, unknown>): Modifier {
  return {
    id: m.id as string,
    groupId: m.group_id as string,
    businessId: m.business_id as string,
    name: m.name as string,
    priceDelta: toMoney(m.price_delta),
    isAvailable: m.is_available as boolean,
  };
}

function toModifierGroup(g: Record<string, unknown>): ModifierGroup {
  return {
    id: g.id as string,
    itemId: g.item_id as string,
    businessId: g.business_id as string,
    name: g.name as string,
    required: g.required as boolean,
    minSelect: g.min_select as number,
    maxSelect: g.max_select as number,
    modifiers: ((g.modifiers as Record<string, unknown>[]) ?? []).map(toModifier),
  };
}

function toMenuItem(i: Record<string, unknown>): MenuItem {
  return {
    id: i.id as string,
    categoryId: i.category_id as string,
    businessId: i.business_id as string,
    name: i.name as string,
    description: (i.description as string) || undefined,
    price: toMoney(i.price),
    happyHourPrice: toOptionalMoney(i.happy_hour_price),
    isAlcoholic: (i.is_alcoholic as boolean) ?? false,
    isAvailable: i.is_available as boolean,
    routingTag: i.routing_tag as MenuItem["routingTag"],
    prepTimeMinutes: (i.prep_time_minutes as number) || undefined,
    displayOrder: i.display_order as number,
    image: (i.image as string) || undefined,
    modifierGroups: ((i.modifier_groups as Record<string, unknown>[]) ?? []).map(toModifierGroup),
  };
}

function toMenuCategory(c: Record<string, unknown>): MenuCategory {
  return {
    id: c.id as string,
    menuId: c.menu_id as string,
    businessId: c.business_id as string,
    name: c.name as string,
    displayOrder: c.display_order as number,
    isActive: c.is_active as boolean,
    items: ((c.items as Record<string, unknown>[]) ?? []).map(toMenuItem),
  };
}

function toMenu(m: Record<string, unknown>): Menu {
  return {
    id: m.id as string,
    businessId: m.business_id as string,
    locationId: (m.location_id as string) || undefined,
    name: m.name as string,
    description: (m.description as string) || undefined,
    isActive: m.is_active as boolean,
    happyHourActive: (m.happy_hour_active as boolean) ?? false,
    categories: ((m.categories as Record<string, unknown>[]) ?? []).map(toMenuCategory),
  };
}

function toOrder(o: Record<string, unknown>): Order {
  const lineItems = (o.line_items as Record<string, unknown>[]) ?? [];
  const timeline = (o.status_timeline as Record<string, unknown>[]) ?? [];
  return {
    id: o.id as string,
    businessId: o.business_id as string,
    locationId: (o.location_id as string) || undefined,
    tableId: (o.table_id as string) || undefined,
    tabId: (o.tab_id as string) || undefined,
    sessionToken: o.session_token as string,
    tableIdentifier: (o.table_identifier as string) || undefined,
    status: o.status as Order["status"],
    idempotencyKey: o.idempotency_key as string,
    // total_amount / prices are Decimal on the backend; toMoney guarantees the
    // declared `number` type regardless of wire format (see lib/money.ts).
    totalAmount: toMoney(o.total_amount),
    notes: (o.notes as string) || undefined,
    placedAt: o.placed_at as string,
    lineItems: lineItems.map((li) => ({
      id: li.id as string,
      orderId: li.order_id as string,
      itemId: (li.item_id as string) || undefined,
      itemName: li.item_name as string,
      quantity: Number(li.quantity),
      unitPrice: toMoney(li.unit_price),
      selectedModifiers: ((li.selected_modifiers as Record<string, unknown>[]) ?? []).map((s) => ({
        modifierId: s.modifier_id as string,
        name: s.name as string,
        priceDelta: toMoney(s.price_delta),
      })),
      routingTag: li.routing_tag as string,
      isAlcoholic: (li.is_alcoholic as boolean) ?? false,
      notes: (li.notes as string) || undefined,
    })),
    statusTimeline: timeline.map((t) => ({
      id: t.id as string,
      fromStatus: (t.from_status as string) || undefined,
      status: t.status as string,
      changedBy: (t.changed_by as string) || undefined,
      changedAt: t.changed_at as string,
    })),
  };
}

// ─── Ordering: Public endpoints ───────────────────────────────────────────────

export async function clientGetMenu(businessId: string): Promise<Menu | null> {
  try {
    const data = await clientFetch<Record<string, unknown>>(
      `/ordering/${businessId}/menu`,
    );
    return toMenu(data);
  } catch {
    return null;
  }
}

export async function clientPlaceOrder(
  businessId: string,
  data: {
    tableToken: string;
    items: Array<{
      itemId: string;
      quantity: number;
      selectedModifiers?: Array<{ modifierId: string; name: string; priceDelta: number }>;
      notes?: string;
    }>;
    notes?: string;
    idempotencyKey: string;
    ageConfirmed?: boolean;
  },
): Promise<Order> {
  const body = {
    table_token: data.tableToken,
    items: data.items.map((i) => ({
      item_id: i.itemId,
      quantity: i.quantity,
      selected_modifiers: (i.selectedModifiers ?? []).map((m) => ({
        modifier_id: m.modifierId,
      })),
      notes: i.notes,
    })),
    notes: data.notes,
    idempotency_key: data.idempotencyKey,
    age_confirmed: data.ageConfirmed ?? false,
  };
  const result = await clientFetch<Record<string, unknown>>(
    `/ordering/${businessId}/orders`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return toOrder(result);
}

export async function clientGetOrderStatus(
  businessId: string,
  sessionToken: string,
): Promise<Order[]> {
  const result = await clientFetch<Record<string, unknown>[]>(
    `/ordering/${businessId}/orders/status?session_token=${encodeURIComponent(sessionToken)}`,
  );
  return result.map(toOrder);
}

// ─── Ordering: Staff endpoints ────────────────────────────────────────────────

export async function clientGetOrders(
  businessId: string,
  filters?: { status?: string[]; routingTag?: string },
): Promise<Order[]> {
  const params = new URLSearchParams();
  if (filters?.status) {
    for (const s of filters.status) params.append("status", s);
  }
  if (filters?.routingTag) params.set("routing_tag", filters.routingTag);
  const q = params.toString();
  const path = q ? `/ordering/${businessId}/orders?${q}` : `/ordering/${businessId}/orders`;
  const result = await authFetch<Record<string, unknown>[]>(path);
  return result.map(toOrder);
}

export async function clientAdvanceOrderStatus(
  businessId: string,
  orderId: string,
  status: Order["status"],
): Promise<Order> {
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/orders/${orderId}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
  return toOrder(result);
}

// ─── Tabs (feature of the ordering module) ─────────────────────────────────────

function toTab(t: Record<string, unknown>): Tab {
  return {
    id: t.id as string,
    businessId: t.business_id as string,
    tableId: (t.table_id as string) || undefined,
    seatingId: (t.seating_id as string) || undefined,
    customerId: (t.customer_id as string) || undefined,
    status: t.status as Tab["status"],
    channel: t.channel as string,
    openedBy: t.opened_by as string,
    openedAt: t.opened_at as string,
    closedBy: (t.closed_by as string) || undefined,
    closedAt: (t.closed_at as string) || undefined,
    settledMethod: (t.settled_method as TabSettledMethod) || undefined,
    total: toMoney(t.total),
    orders: ((t.orders as Record<string, unknown>[]) ?? []).map(toOrder),
  };
}

export async function clientListTabs(
  status?: "open" | "closed",
): Promise<Tab[]> {
  const q = status ? `?status=${status}` : "";
  const result = await authFetch<Record<string, unknown>[]>(`/tabs${q}`);
  return result.map(toTab);
}

export async function clientOpenTab(): Promise<Tab> {
  const result = await authFetch<Record<string, unknown>>(`/tabs`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return toTab(result);
}

export async function clientOpenSeatingTab(seatingId: string): Promise<Tab> {
  const result = await authFetch<Record<string, unknown>>(`/tabs/seatings/${seatingId}`, {
    method: "POST",
  });
  return toTab(result);
}

export async function clientGetTab(tabId: string): Promise<Tab> {
  const result = await authFetch<Record<string, unknown>>(`/tabs/${tabId}`);
  return toTab(result);
}

// Add a staff-placed order to an open tab. Goes through the same
// order_service.place_order path as public ordering (so happy-hour pricing
// applies), but the tabs route calls it with require_age_confirmation=False —
// staff entering an order in person skip the self-service age attestation.
// Tenant is resolved from the JWT server-side, so no businessId in the path.
export async function clientAddOrderToTab(
  tabId: string,
  data: {
    tableIdentifier?: string;
    items: Array<{
      itemId: string;
      quantity: number;
      selectedModifiers?: Array<{ modifierId: string; name: string; priceDelta: number }>;
      notes?: string;
    }>;
    notes?: string;
    idempotencyKey: string;
  },
): Promise<Order> {
  const body = {
    table_identifier: data.tableIdentifier,
    items: data.items.map((i) => ({
      item_id: i.itemId,
      quantity: i.quantity,
      selected_modifiers: (i.selectedModifiers ?? []).map((m) => ({
        modifier_id: m.modifierId,
      })),
      notes: i.notes,
    })),
    notes: data.notes,
    idempotency_key: data.idempotencyKey,
  };
  const result = await authFetch<Record<string, unknown>>(
    `/tabs/${tabId}/orders`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return toOrder(result);
}

export async function clientCloseTab(
  tabId: string,
  settledMethod: TabSettledMethod,
): Promise<Tab> {
  const result = await authFetch<Record<string, unknown>>(
    `/tabs/${tabId}/close`,
    { method: "POST", body: JSON.stringify({ settled_method: settledMethod }) },
  );
  return toTab(result);
}

export async function clientGetMenus(businessId: string): Promise<Menu[]> {
  const result = await authFetch<Record<string, unknown>[]>(
    `/ordering/${businessId}/menus`,
  );
  return result.map(toMenu);
}

export async function clientCreateMenu(
  businessId: string,
  data: { name: string; description?: string; locationId?: string },
): Promise<Menu> {
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/menus`,
    {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        description: data.description,
        location_id: data.locationId,
      }),
    },
  );
  return toMenu(result);
}

export async function clientUpdateMenu(
  businessId: string,
  menuId: string,
  data: { name?: string; description?: string; isActive?: boolean },
): Promise<Menu> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.description !== undefined) body.description = data.description;
  if (data.isActive !== undefined) body.is_active = data.isActive;
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/menus/${menuId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return toMenu(result);
}

export async function clientDeleteMenu(
  businessId: string,
  menuId: string,
): Promise<void> {
  await authFetch(`/ordering/${businessId}/menus/${menuId}`, { method: "DELETE" });
}

export async function clientCreateCategory(
  businessId: string,
  menuId: string,
  data: { name: string; displayOrder?: number },
): Promise<MenuCategory> {
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/menus/${menuId}/categories`,
    {
      method: "POST",
      body: JSON.stringify({ name: data.name, display_order: data.displayOrder ?? 0 }),
    },
  );
  return toMenuCategory(result);
}

export async function clientUpdateCategory(
  businessId: string,
  categoryId: string,
  data: { name?: string; displayOrder?: number; isActive?: boolean },
): Promise<MenuCategory> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.displayOrder !== undefined) body.display_order = data.displayOrder;
  if (data.isActive !== undefined) body.is_active = data.isActive;
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/categories/${categoryId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return toMenuCategory(result);
}

export async function clientDeleteCategory(
  businessId: string,
  categoryId: string,
): Promise<void> {
  await authFetch(`/ordering/${businessId}/categories/${categoryId}`, { method: "DELETE" });
}

export async function clientCreateMenuItem(
  businessId: string,
  categoryId: string,
  data: {
    name: string;
    description?: string;
    price: number;
    happyHourPrice?: number | null;
    isAlcoholic?: boolean;
    isAvailable?: boolean;
    routingTag?: string;
    prepTimeMinutes?: number;
    displayOrder?: number;
    image?: string;
  },
): Promise<MenuItem> {
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/categories/${categoryId}/items`,
    {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        description: data.description,
        price: data.price,
        happy_hour_price: data.happyHourPrice ?? null,
        is_alcoholic: data.isAlcoholic ?? false,
        is_available: data.isAvailable ?? true,
        routing_tag: data.routingTag ?? "kitchen",
        prep_time_minutes: data.prepTimeMinutes,
        display_order: data.displayOrder ?? 0,
        image: data.image,
      }),
    },
  );
  return toMenuItem(result);
}

export async function clientUpdateMenuItem(
  businessId: string,
  itemId: string,
  data: {
    name?: string;
    description?: string;
    price?: number;
    happyHourPrice?: number | null;
    isAlcoholic?: boolean;
    isAvailable?: boolean;
    routingTag?: string;
    prepTimeMinutes?: number;
    displayOrder?: number;
    image?: string;
  },
): Promise<MenuItem> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.description !== undefined) body.description = data.description;
  if (data.price !== undefined) body.price = data.price;
  // Send happy_hour_price when explicitly provided (a number sets it, null
  // clears the discount). Backend treats "field present" as set/clear.
  if (data.happyHourPrice !== undefined) body.happy_hour_price = data.happyHourPrice;
  if (data.isAlcoholic !== undefined) body.is_alcoholic = data.isAlcoholic;
  if (data.isAvailable !== undefined) body.is_available = data.isAvailable;
  if (data.routingTag !== undefined) body.routing_tag = data.routingTag;
  if (data.prepTimeMinutes !== undefined) body.prep_time_minutes = data.prepTimeMinutes;
  if (data.displayOrder !== undefined) body.display_order = data.displayOrder;
  if (data.image !== undefined) body.image = data.image;
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/items/${itemId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return toMenuItem(result);
}

export async function clientToggleItemAvailability(
  businessId: string,
  itemId: string,
): Promise<MenuItem> {
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/items/${itemId}/toggle-availability`,
    { method: "POST" },
  );
  return toMenuItem(result);
}

export async function clientDeleteMenuItem(
  businessId: string,
  itemId: string,
): Promise<void> {
  await authFetch(`/ordering/${businessId}/items/${itemId}`, { method: "DELETE" });
}

// ─── Ordering: Settings ───────────────────────────────────────────────────────

export async function clientGetOrderingSettings(
  businessId: string,
): Promise<{ isAcceptingOrders: boolean }> {
  const result = await clientFetch<{ is_accepting_orders: boolean }>(
    `/ordering/${businessId}/settings`,
  );
  return { isAcceptingOrders: result.is_accepting_orders };
}

export async function clientSetOrderingSettings(
  businessId: string,
  isAcceptingOrders: boolean,
): Promise<{ isAcceptingOrders: boolean }> {
  const result = await authFetch<{ is_accepting_orders: boolean }>(
    `/ordering/${businessId}/settings`,
    { method: "PATCH", body: JSON.stringify({ is_accepting_orders: isAcceptingOrders }) },
  );
  return { isAcceptingOrders: result.is_accepting_orders };
}

// ─── Ordering: Item Library ───────────────────────────────────────────────────

function toLibraryItem(d: Record<string, unknown>): LibraryItem {
  return {
    id: d.id as string,
    businessId: d.business_id as string,
    name: d.name as string,
    description: d.description as string | undefined,
    price: toMoney(d.price),
    routingTag: d.routing_tag as string,
    prepTimeMinutes: d.prep_time_minutes as number | undefined,
  };
}

export async function clientGetLibrary(businessId: string): Promise<LibraryItem[]> {
  const result = await authFetch<Record<string, unknown>[]>(
    `/ordering/${businessId}/library`,
  );
  return result.map(toLibraryItem);
}

export async function clientCreateLibraryItem(
  businessId: string,
  data: { name: string; description?: string; price: number; routingTag?: string; prepTimeMinutes?: number },
): Promise<LibraryItem> {
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/library`,
    {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        description: data.description,
        price: data.price,
        routing_tag: data.routingTag ?? "kitchen",
        prep_time_minutes: data.prepTimeMinutes,
      }),
    },
  );
  return toLibraryItem(result);
}

export async function clientUpdateLibraryItem(
  businessId: string,
  itemId: string,
  data: { name?: string; description?: string; price?: number; routingTag?: string; prepTimeMinutes?: number },
): Promise<LibraryItem> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.description !== undefined) body.description = data.description;
  if (data.price !== undefined) body.price = data.price;
  if (data.routingTag !== undefined) body.routing_tag = data.routingTag;
  if (data.prepTimeMinutes !== undefined) body.prep_time_minutes = data.prepTimeMinutes;
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/library/${itemId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return toLibraryItem(result);
}

export async function clientDeleteLibraryItem(businessId: string, itemId: string): Promise<void> {
  await authFetch(`/ordering/${businessId}/library/${itemId}`, { method: "DELETE" });
}

export async function clientSaveItemToLibrary(
  businessId: string,
  itemId: string,
): Promise<LibraryItem> {
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/items/${itemId}/save-to-library`,
    { method: "POST" },
  );
  return toLibraryItem(result);
}

export async function clientAddLibraryItemToCategory(
  businessId: string,
  libraryItemId: string,
  categoryId: string,
): Promise<MenuItem> {
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/library/${libraryItemId}/add-to-category/${categoryId}`,
    { method: "POST" },
  );
  return toMenuItem(result);
}

// ─── Inventory ────────────────────────────────────────────────────────────────

function toInventoryItem(raw: Record<string, unknown>): InventoryItem {
  const parQty = toOptionalMoney(raw.par_quantity);
  const currentQty = toMoney(raw.current_quantity);
  return {
    id: raw.id as string,
    businessId: raw.business_id as string,
    locationId: raw.location_id as string | undefined,
    name: raw.name as string,
    unit: raw.unit as string,
    unitType: (raw.unit_type as InventoryItem["unitType"]) ?? "each",
    containerVolumeMl: toOptionalMoney(raw.container_volume_ml),
    defaultPourMl: toOptionalMoney(raw.default_pour_ml),
    currentQuantity: currentQty,
    parQuantity: parQty,
    costPerUnit: toOptionalMoney(raw.cost_per_unit),
    notes: raw.notes as string | undefined,
    isActive: raw.is_active as boolean,
    archivedAt: (raw.archived_at as string) || undefined,
    isLowStock: parQty != null && currentQty < parQty,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

function toStockMovement(raw: Record<string, unknown>): StockMovement {
  return {
    id: raw.id as string,
    businessId: raw.business_id as string,
    locationId: raw.location_id as string | undefined,
    itemId: raw.item_id as string,
    movementType: raw.movement_type as StockMovement["movementType"],
    quantityDelta: toMoney(raw.quantity_delta),
    reason: (raw.reason as StockMovement["reason"]) ?? undefined,
    notes: raw.notes as string | undefined,
    createdBy: raw.created_by as string | undefined,
    alertTriggered: raw.alert_triggered as boolean,
    createdAt: raw.created_at as string,
  };
}

export async function clientGetInventoryItems(
  businessId: string,
  locationId?: string,
): Promise<InventoryItem[]> {
  const params = locationId ? `?location_id=${locationId}` : "";
  const result = await authFetch<Record<string, unknown>[]>(
    `/inventory/${businessId}/items${params}`,
  );
  return (result ?? []).map(toInventoryItem);
}

export async function clientCreateInventoryItem(
  businessId: string,
  data: {
    name: string;
    unit: string;
    unitType?: string;
    containerVolumeMl?: number;
    defaultPourMl?: number;
    parQuantity?: number;
    costPerUnit?: number;
    notes?: string;
    locationId?: string;
  },
): Promise<InventoryItem> {
  const body: Record<string, unknown> = { name: data.name, unit: data.unit };
  if (data.unitType !== undefined) body.unit_type = data.unitType;
  if (data.containerVolumeMl !== undefined)
    body.container_volume_ml = data.containerVolumeMl;
  if (data.defaultPourMl !== undefined) body.default_pour_ml = data.defaultPourMl;
  if (data.parQuantity !== undefined) body.par_quantity = data.parQuantity;
  if (data.costPerUnit !== undefined) body.cost_per_unit = data.costPerUnit;
  if (data.notes !== undefined) body.notes = data.notes;
  if (data.locationId !== undefined) body.location_id = data.locationId;
  const result = await authFetch<Record<string, unknown>>(
    `/inventory/${businessId}/items`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return toInventoryItem(result);
}

export async function clientUpdateInventoryItem(
  businessId: string,
  itemId: string,
  data: {
    name?: string;
    unit?: string;
    unitType?: string;
    // null clears container_volume_ml (e.g. switching an item back to 'each').
    containerVolumeMl?: number | null;
    // null clears default_pour_ml (removes the pours-remaining estimate).
    defaultPourMl?: number | null;
    parQuantity?: number | null;
    costPerUnit?: number | null;
    notes?: string | null;
    locationId?: string | null;
  },
): Promise<InventoryItem> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.unit !== undefined) body.unit = data.unit;
  if (data.unitType !== undefined) body.unit_type = data.unitType;
  // Send when explicitly provided (a number sets it, null clears it). Backend
  // treats "field present" as set/clear via model_fields_set.
  if (data.containerVolumeMl !== undefined)
    body.container_volume_ml = data.containerVolumeMl;
  if (data.defaultPourMl !== undefined) body.default_pour_ml = data.defaultPourMl;
  if (data.parQuantity !== undefined) body.par_quantity = data.parQuantity;
  if (data.costPerUnit !== undefined) body.cost_per_unit = data.costPerUnit;
  if (data.notes !== undefined) body.notes = data.notes;
  if (data.locationId !== undefined) body.location_id = data.locationId;
  const result = await authFetch<Record<string, unknown>>(
    `/inventory/${businessId}/items/${itemId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return toInventoryItem(result);
}

export async function clientDeleteInventoryItem(
  businessId: string,
  itemId: string,
): Promise<void> {
  await authFetch(`/inventory/${businessId}/items/${itemId}`, { method: "DELETE" });
}

export async function clientGetLowStockItems(
  businessId: string,
): Promise<InventoryItem[]> {
  const result = await authFetch<Record<string, unknown>[]>(
    `/inventory/${businessId}/low-stock`,
  );
  return (result ?? []).map(toInventoryItem);
}

export interface InventoryDiscrepancy {
  id: string;
  businessId: string;
  orderId?: string;
  itemId?: string;
  kind: string;
  details: string;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt?: string;
}

export async function clientGetInventoryDiscrepancies(
  businessId: string,
): Promise<InventoryDiscrepancy[]> {
  const result = await authFetch<Record<string, unknown>[]>(
    `/inventory/${businessId}/discrepancies`,
  );
  return (result ?? []).map((raw) => ({
    id: raw.id as string,
    businessId: raw.business_id as string,
    orderId: (raw.order_id as string) || undefined,
    itemId: (raw.item_id as string) || undefined,
    kind: raw.kind as string,
    details: raw.details as string,
    status: raw.status as InventoryDiscrepancy["status"],
    createdAt: raw.created_at as string,
    resolvedAt: (raw.resolved_at as string) || undefined,
  }));
}

export async function clientRecordStockMovement(
  businessId: string,
  itemId: string,
  data: {
    movementType: "receive" | "adjust" | "waste";
    // Provide exactly one of quantityDelta (item's storage unit — ml for
    // bottle/keg) or containerQuantity (number of containers for a bottle/keg
    // receive; converted to ml server-side).
    quantityDelta?: number;
    containerQuantity?: number;
    reason?: WasteReason;
    notes?: string;
    locationId?: string;
  },
): Promise<StockMovement> {
  const body: Record<string, unknown> = { movement_type: data.movementType };
  if (data.quantityDelta !== undefined) body.quantity_delta = data.quantityDelta;
  if (data.containerQuantity !== undefined)
    body.container_quantity = data.containerQuantity;
  if (data.reason !== undefined) body.reason = data.reason;
  if (data.notes !== undefined) body.notes = data.notes;
  if (data.locationId !== undefined) body.location_id = data.locationId;
  const result = await authFetch<Record<string, unknown>>(
    `/inventory/${businessId}/items/${itemId}/movements`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return toStockMovement(result);
}

// ─── Recipes (menu_item_ingredients) ──────────────────────────────────────────

function toRecipeIngredient(raw: Record<string, unknown>): RecipeIngredient {
  return {
    id: raw.id as string,
    inventoryItemId: raw.inventory_item_id as string,
    inventoryItemName: raw.inventory_item_name as string,
    unitType: (raw.unit_type as RecipeIngredient["unitType"]) ?? "each",
    unit: raw.unit as string,
    quantity: toMoney(raw.quantity),
  };
}

export async function clientGetRecipe(
  businessId: string,
  itemId: string,
): Promise<RecipeIngredient[]> {
  const result = await authFetch<Record<string, unknown>[]>(
    `/ordering/${businessId}/items/${itemId}/recipe`,
  );
  return (result ?? []).map(toRecipeIngredient);
}

export async function clientSetRecipe(
  businessId: string,
  itemId: string,
  ingredients: { inventoryItemId: string; quantity: number }[],
): Promise<RecipeIngredient[]> {
  const result = await authFetch<Record<string, unknown>[]>(
    `/ordering/${businessId}/items/${itemId}/recipe`,
    {
      method: "PUT",
      body: JSON.stringify({
        ingredients: ingredients.map((i) => ({
          inventory_item_id: i.inventoryItemId,
          quantity: i.quantity,
        })),
      }),
    },
  );
  return (result ?? []).map(toRecipeIngredient);
}

/**
 * Per-menu-item stock info for items with a recipe: the low-stock (below-par)
 * flag plus the recipe-exact live servings-remaining count. Menu items without a
 * recipe are omitted (no meaningful count).
 */
export async function clientGetMenuItemStockFlags(
  businessId: string,
): Promise<MenuItemStockInfo[]> {
  const result = await authFetch<Record<string, unknown>[]>(
    `/ordering/${businessId}/menu-item-stock-flags`,
  );
  return (result ?? []).map((r) => ({
    menuItemId: r.menu_item_id as string,
    hasLowStockIngredient: Boolean(r.has_low_stock_ingredient),
    servingsRemaining:
      r.servings_remaining == null ? null : Number(r.servings_remaining),
  }));
}

export async function clientGetStockMovements(
  businessId: string,
  itemId: string,
  params?: { limit?: number; offset?: number },
): Promise<StockMovement[]> {
  const qs = new URLSearchParams();
  if (params?.limit !== undefined) qs.set("limit", String(params.limit));
  if (params?.offset !== undefined) qs.set("offset", String(params.offset));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  const result = await authFetch<Record<string, unknown>[]>(
    `/inventory/${businessId}/items/${itemId}/movements${query}`,
  );
  return (result ?? []).map(toStockMovement);
}

export async function clientGetKpis(
  businessId: string,
): Promise<OperationalKpis | null> {
  const result = await authFetch<{
    reservation: Record<string, unknown>;
    ordering: Record<string, unknown> | null;
    inventory: Record<string, unknown> | null;
  }>(`/analytics/business/${businessId}/kpis`);
  if (!result) return null;
  return {
    reservation: {
      cancellationRate: result.reservation.cancellation_rate as number,
      completionRate: result.reservation.completion_rate as number,
      avgLeadTimeHours: result.reservation.avg_lead_time_hours as number,
      occupancyByHour: result.reservation.occupancy_by_hour as { hour: number; count: number }[],
    },
    ordering: result.ordering
      ? {
          avgPrepTimeMinutes: result.ordering.avg_prep_time_minutes as number,
          peakHours: result.ordering.peak_hours as { hour: number; count: number }[],
          topItems: result.ordering.top_items as { name: string; totalOrdered: number }[],
        }
      : null,
    inventory: result.inventory
      ? {
          totalMovements: result.inventory.total_movements as number,
          wasteMovements: result.inventory.waste_movements as number,
          lowStockIncidents: result.inventory.low_stock_incidents as number,
          itemsBelowPar: result.inventory.items_below_par as number,
        }
      : null,
  };
}

export async function clientGetHighRiskReservations(
  businessId: string,
): Promise<HighRiskReservation[]> {
  const result = await authFetch<Record<string, unknown>[]>(
    `/analytics/business/${businessId}/high-risk`,
  );
  return (result ?? []).map((r) => ({
    id: r.id as string,
    time: r.time as string,
    guests: r.guests as number,
    status: r.status as string,
    customerId: r.customer_id as string,
    serviceTypeId: r.service_type_id as string,
    riskScore: r.risk_score as number,
  }));
}

// ─── Staff Invitations ────────────────────────────────────────────────────────

export interface StaffInvitation {
  id: string;
  email: string;
  role: "owner" | "manager" | "staff";
  expiresAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  sentAt?: string;
  deliveryStatus: "pending" | "sent" | "failed";
  deliveryError?: string;
}

function toStaffInvitation(value: Record<string, unknown>): StaffInvitation {
  return {
    id: value.id as string,
    email: value.email as string,
    role: value.role as StaffInvitation["role"],
    expiresAt: value.expires_at as string,
    acceptedAt: (value.accepted_at as string) || undefined,
    revokedAt: (value.revoked_at as string) || undefined,
    sentAt: (value.sent_at as string) || undefined,
    deliveryStatus: value.delivery_status as StaffInvitation["deliveryStatus"],
    deliveryError: (value.delivery_error as string) || undefined,
  };
}

export async function clientSendInvite(
  email: string,
  role: string,
): Promise<StaffInvitation> {
  const result = await authFetch<Record<string, unknown>>("/staff/invite", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
  return toStaffInvitation(result);
}

export async function clientListInvitations(): Promise<StaffInvitation[]> {
  const result = await authFetch<Record<string, unknown>[]>("/staff/invitations");
  return (result ?? []).map(toStaffInvitation);
}

export async function clientRevokeInvitation(id: string): Promise<StaffInvitation> {
  const result = await authFetch<Record<string, unknown>>(
    `/staff/invitations/${id}/revoke`,
    { method: "POST" },
  );
  return toStaffInvitation(result);
}

export async function clientResendInvitation(id: string): Promise<StaffInvitation> {
  const result = await authFetch<Record<string, unknown>>(
    `/staff/invitations/${id}/resend`,
    { method: "POST" },
  );
  return toStaffInvitation(result);
}

export async function clientGetInvite(token: string): Promise<{
  email: string;
  role: string;
  business_name: string;
} | null> {
  try {
    return await clientFetch(`/staff/invite/${token}`);
  } catch {
    return null;
  }
}

// ─── Happy Hour windows (staff; behind the ordering module) ───────────────────

function toHappyHourWindow(w: Record<string, unknown>): HappyHourWindow {
  return {
    id: w.id as string,
    businessId: w.business_id as string,
    name: w.name as string,
    daysOfWeek: (w.days_of_week as number[]) ?? [],
    // Backend serializes TIME as "HH:MM:SS"; keep the "HH:MM" prefix for inputs.
    startTime: (w.start_time as string)?.slice(0, 5) ?? "",
    endTime: (w.end_time as string)?.slice(0, 5) ?? "",
    isActive: (w.is_active as boolean) ?? true,
  };
}

export async function clientGetHappyHourWindows(): Promise<HappyHourWindow[]> {
  const result = await authFetch<Record<string, unknown>[]>("/happy-hour/windows");
  return (result ?? []).map(toHappyHourWindow);
}

export async function clientCreateHappyHourWindow(data: {
  name: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  isActive?: boolean;
}): Promise<HappyHourWindow> {
  const result = await authFetch<Record<string, unknown>>("/happy-hour/windows", {
    method: "POST",
    body: JSON.stringify({
      name: data.name,
      days_of_week: data.daysOfWeek,
      start_time: data.startTime,
      end_time: data.endTime,
      is_active: data.isActive ?? true,
    }),
  });
  return toHappyHourWindow(result);
}

export async function clientUpdateHappyHourWindow(
  windowId: string,
  data: Partial<{
    name: string;
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    isActive: boolean;
  }>,
): Promise<HappyHourWindow> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.daysOfWeek !== undefined) body.days_of_week = data.daysOfWeek;
  if (data.startTime !== undefined) body.start_time = data.startTime;
  if (data.endTime !== undefined) body.end_time = data.endTime;
  if (data.isActive !== undefined) body.is_active = data.isActive;
  const result = await authFetch<Record<string, unknown>>(
    `/happy-hour/windows/${windowId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return toHappyHourWindow(result);
}

export async function clientDeleteHappyHourWindow(windowId: string): Promise<void> {
  await authFetch(`/happy-hour/windows/${windowId}`, { method: "DELETE" });
}
