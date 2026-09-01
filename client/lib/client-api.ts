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
  InventoryItem,
  LibraryItem,
  Menu,
  MenuCategory,
  MenuItem,
  Modifier,
  ModifierGroup,
  MeContext,
  Notification,
  Order,
  OrderLineItem,
  OrderAllDayCount,
  PreparationStation,
  QueueEntry,
  QueueServiceDay,
  QueueStatus,
  MenuItemStockInfo,
  RecipeIngredient,
  Reservation,
  ReservationWaitlistEntry,
  RegionalAudit,
  RegionalOption,
  ServiceType,
  StockMovement,
  Tab,
  TabSettledMethod,
  TaxProfile,
  TaxProfileVersion,
  WasteReason,
  ConsumptionVariance,
  ControllableCogs,
  CostControlOverview,
  CountLine,
  CountSession,
  CountSessionSummary,
  InventoryValuation,
  MenuMargins,
  PackConversion,
  PriceHistoryEntry,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseReceipt,
  ReorderSuggestion,
  Supplier,
  SupplierProduct,
} from "@/types";
import { toMoney, toOptionalMoney } from "@/lib/money";
import type { Capability, StaffRole } from "@/lib/permissions";

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
    countryCode: (b.country_code as string) || "DE",
    currencyCode: (b.currency_code as string) || "EUR",
    locale: (b.locale as string) || "de-DE",
    taxLabel: (b.tax_label as string) || "VAT",
    legalDrinkingAge: (b.legal_drinking_age as number) ?? 18,
    address: (b.address as string) || undefined,
    description: (b.description as string) || undefined,
    image: (b.image as string) || undefined,
    website: (b.website as string) || undefined,
    privacyContact: (b.privacy_contact as string) || undefined,
    privacyPolicyUrl: (b.privacy_policy_url as string) || undefined,
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
    acceptedReservationId: (entry.accepted_reservation_id as string) || undefined,
    terminalAt: (entry.terminal_at as string) || undefined,
    terminalReasonCode: (entry.terminal_reason_code as string) || undefined,
    terminalReasonNote: (entry.terminal_reason_note as string) || undefined,
    managementToken: (entry.management_token as string) || undefined,
    deliveryState: (entry.delivery_state as string) || undefined,
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
    const data = await clientFetch<Record<string, unknown>>(`/businesses/${id}`);
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
    countryCode: string;
    currencyCode: string;
    locale: string;
    taxLabel: string;
    legalDrinkingAge: number;
    address: string;
    description: string;
    image: string;
    website: string;
    privacyContact: string;
    privacyPolicyUrl: string;
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
  if (data.countryCode !== undefined) apiData.country_code = data.countryCode;
  if (data.currencyCode !== undefined) apiData.currency_code = data.currencyCode;
  if (data.locale !== undefined) apiData.locale = data.locale;
  if (data.taxLabel !== undefined) apiData.tax_label = data.taxLabel;
  if (data.legalDrinkingAge !== undefined)
    apiData.legal_drinking_age = data.legalDrinkingAge;
  if (data.address !== undefined) apiData.address = data.address;
  if (data.description !== undefined) apiData.description = data.description;
  if (data.image !== undefined) apiData.image = data.image;
  if (data.website !== undefined) apiData.website = data.website;
  if (data.privacyContact !== undefined)
    apiData.privacy_contact = data.privacyContact;
  if (data.privacyPolicyUrl !== undefined)
    apiData.privacy_policy_url = data.privacyPolicyUrl;
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

function toTaxProfileVersion(value: Record<string, unknown>): TaxProfileVersion {
  return {
    id: value.id as string,
    taxProfileId: value.tax_profile_id as string,
    businessId: value.business_id as string,
    name: value.name as string,
    rate: toMoney(value.rate),
    priceIncludesTax: value.price_includes_tax as boolean,
    effectiveFrom: value.effective_from as string,
    note: (value.note as string) || undefined,
    createdBy: (value.created_by as string) || undefined,
    createdAt: value.created_at as string,
  };
}

function toTaxProfile(value: Record<string, unknown>): TaxProfile {
  const current = value.current_version as Record<string, unknown> | null;
  return {
    id: value.id as string,
    businessId: value.business_id as string,
    code: value.code as string,
    isActive: value.is_active as boolean,
    currentVersion: current ? toTaxProfileVersion(current) : undefined,
    versions: ((value.versions as Record<string, unknown>[]) ?? []).map(toTaxProfileVersion),
    archivedAt: (value.archived_at as string) || undefined,
    createdAt: value.created_at as string,
    updatedAt: value.updated_at as string,
  };
}

export async function clientGetRegionalOptions(locale = "en"): Promise<{
  countries: RegionalOption[];
  currencies: RegionalOption[];
}> {
  return clientFetch(`/regional/options?locale=${encodeURIComponent(locale)}`);
}

export async function clientGetRegionalSuggestion(countryCode: string): Promise<{
  countryCode: string;
  currencyCode: string;
  locale: string;
  taxLabel: string;
}> {
  const value = await clientFetch<Record<string, unknown>>(
    `/regional/suggestion/${encodeURIComponent(countryCode)}`,
  );
  return {
    countryCode: value.country_code as string,
    currencyCode: value.currency_code as string,
    locale: value.locale as string,
    taxLabel: value.tax_label as string,
  };
}

export async function clientGetRegionalAudit(businessId: string): Promise<RegionalAudit[]> {
  const values = await authFetch<Record<string, unknown>[]>(
    `/businesses/${businessId}/regional-audit`,
  );
  return values.map((value) => ({
    id: value.id as string,
    businessId: value.business_id as string,
    changedBy: (value.changed_by as string) || undefined,
    previousValues: value.previous_values as Record<string, string>,
    newValues: value.new_values as Record<string, string>,
    changedAt: value.changed_at as string,
  }));
}

export async function clientGetTaxProfiles(): Promise<TaxProfile[]> {
  const values = await authFetch<Record<string, unknown>[]>("/tax-profiles");
  return values.map(toTaxProfile);
}

export async function clientCreateTaxProfile(data: {
  code: string;
  name: string;
  rate: number;
  priceIncludesTax: boolean;
  effectiveFrom?: string;
  note?: string;
}): Promise<TaxProfile> {
  const value = await authFetch<Record<string, unknown>>("/tax-profiles", {
    method: "POST",
    body: JSON.stringify({
      code: data.code,
      name: data.name,
      rate: data.rate,
      price_includes_tax: data.priceIncludesTax,
      effective_from: data.effectiveFrom,
      note: data.note,
    }),
  });
  return toTaxProfile(value);
}

export async function clientCreateTaxProfileVersion(
  profileId: string,
  data: {
    name: string;
    rate: number;
    priceIncludesTax: boolean;
    effectiveFrom?: string;
    note?: string;
  },
): Promise<TaxProfile> {
  const value = await authFetch<Record<string, unknown>>(
    `/tax-profiles/${profileId}/versions`,
    {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        rate: data.rate,
        price_includes_tax: data.priceIncludesTax,
        effective_from: data.effectiveFrom,
        note: data.note,
      }),
    },
  );
  return toTaxProfile(value);
}

export async function clientArchiveTaxProfile(profileId: string): Promise<TaxProfile> {
  return toTaxProfile(
    await authFetch<Record<string, unknown>>(`/tax-profiles/${profileId}/archive`, {
      method: "POST",
    }),
  );
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

export async function clientGetPublicManagedReservation(): Promise<Reservation> {
  return toReservation(await clientFetch<Record<string, unknown>>(`/reservations/public/manage`));
}

export async function clientCancelPublicReservation(): Promise<Reservation> {
  return toReservation(await clientFetch<Record<string, unknown>>(`/reservations/public/manage/cancel`, { method: "POST" }));
}

export async function clientReconfirmPublicReservation(): Promise<Reservation> {
  return toReservation(await clientFetch<Record<string, unknown>>(`/reservations/public/manage/reconfirm`, { method: "POST" }));
}

export async function clientReschedulePublicReservation(data: {
  serviceTypeId: string; time: string; guests: number;
}): Promise<Reservation> {
  return toReservation(await clientFetch<Record<string, unknown>>(`/reservations/public/manage/reschedule`, {
    method: "POST",
    body: JSON.stringify({ service_type_id: data.serviceTypeId, time: data.time, guests: data.guests }),
  }));
}

export async function clientAcceptWaitlistOffer(): Promise<Reservation> {
  return toReservation(await clientFetch<Record<string, unknown>>(`/reservations/waitlist/offers/accept`, { method: "POST" }));
}

export async function clientGetWaitlistOffer(): Promise<ReservationWaitlistEntry> {
  return toReservationWaitlistEntry(await clientFetch<Record<string, unknown>>(`/reservations/waitlist/offers`));
}

export async function clientDeclineWaitlistOffer(): Promise<ReservationWaitlistEntry> {
  return toReservationWaitlistEntry(await clientFetch<Record<string, unknown>>(`/reservations/waitlist/offers/decline`, { method: "POST" }));
}

export interface ReservationWaitlistCreateInput {
  businessId: string; serviceTypeId: string; requestedStartsAt: string; flexibleUntil: string;
  guests: number; name: string; phone: string; email: string; idempotencyKey: string;
}

function waitlistPayload(data: ReservationWaitlistCreateInput) {
  return { business_id: data.businessId, service_type_id: data.serviceTypeId,
    requested_starts_at: data.requestedStartsAt, flexible_until: data.flexibleUntil,
    guests: data.guests, name: data.name, phone: data.phone, email: data.email,
    idempotency_key: data.idempotencyKey };
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

export async function clientGetReservationWaitlist(view: "active" | "history" = "active"): Promise<ReservationWaitlistEntry[]> {
  const result = await authFetch<Record<string, unknown>[]>(`/reservations/waitlist?view=${view}`);
  return result.map(toReservationWaitlistEntry);
}

export async function clientGetManagedWaitlist(): Promise<ReservationWaitlistEntry> {
  return toReservationWaitlistEntry(await clientFetch<Record<string, unknown>>(`/reservations/waitlist/manage`));
}

export async function clientCancelManagedWaitlist(): Promise<ReservationWaitlistEntry> {
  return toReservationWaitlistEntry(await clientFetch<Record<string, unknown>>(`/reservations/waitlist/manage/cancel`, { method: "POST" }));
}

export async function clientRemoveReservationWaitlist(entryId: string, reasonCode: string, note?: string): Promise<ReservationWaitlistEntry> {
  return toReservationWaitlistEntry(await authFetch<Record<string, unknown>>(`/reservations/waitlist/${entryId}/remove`, { method: "POST", body: JSON.stringify({ reason_code: reasonCode, note }) }));
}

export async function clientRetryReservationWaitlistDelivery(entryId: string): Promise<ReservationWaitlistEntry> {
  return toReservationWaitlistEntry(await authFetch<Record<string, unknown>>(`/reservations/waitlist/${entryId}/delivery/retry`, { method: "POST" }));
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
      capabilities: (data.capabilities as Capability[]) ?? [],
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
  const delivery = e.delivery as Record<string, unknown> | null | undefined;
  return {
    id: (e.id as string) ?? "public-queue-entry",
    businessId: (e.business_id as string) ?? "",
    name: e.name as string,
    partySize: e.party_size as number,
    phone: (e.phone as string) || undefined,
    status: e.status as QueueEntry["status"],
    position: (e.position as number) ?? undefined,
    joinedAt: e.joined_at as string,
    calledAt: (e.called_at as string) || undefined,
    seatedAt: (e.seated_at as string) || undefined,
    completedAt: (e.completed_at as string) || undefined,
    removedAt: (e.removed_at as string) || undefined,
    serviceDate: e.service_date as string,
    terminalReasonCode: (e.terminal_reason_code as string) || undefined,
    terminalReasonNote: (e.terminal_reason_note as string) || undefined,
    delivery: delivery ? {
      state: delivery.state as string,
      channel: (delivery.channel as string) || undefined,
      retryable: (delivery.retryable as boolean) ?? false,
      attemptCount: Number(delivery.attempt_count ?? 0),
      lastError: (delivery.last_error as string) || undefined,
    } : undefined,
  };
}

function toQueueServiceDay(s: Record<string, unknown>): QueueServiceDay {
  return {
    serviceDate: s.service_date as string,
    status: s.status as QueueServiceDay["status"],
    isOpen: s.is_open as boolean,
    isFull: s.is_full as boolean,
    maxWaitingCovers: (s.max_waiting_covers as number | null) ?? undefined,
    waitingCovers: Number(s.waiting_covers ?? 0),
    estimatedWaitMinutes: (s.estimated_wait_minutes as number | null) ?? undefined,
    updatedAt: (s.updated_at as string) || undefined,
  };
}

function toQueueStatus(s: Record<string, unknown>): QueueStatus {
  return {
    entry: toQueueEntry(s.entry as Record<string, unknown>),
    estimatedWaitMinutes: (s.estimated_wait_minutes as number) ?? undefined,
  };
}

export async function clientLeaveQueue(
  businessId: string,
): Promise<void> {
  await clientFetch(
    `/queue/${businessId}/leave`,
    { method: "POST" },
  );
}

export async function clientJoinQueue(
  businessId: string,
  data: { name: string; partySize: number; phone?: string; idempotencyKey: string },
): Promise<QueueStatus> {
  const result = await clientFetch<Record<string, unknown>>(
    `/queue/${businessId}/join`,
    {
      method: "POST",
      body: JSON.stringify({ name: data.name, party_size: data.partySize, phone: data.phone, idempotency_key: data.idempotencyKey }),
    },
  );
  return toQueueStatus(result);
}

export async function clientGetQueueStatus(
  businessId: string,
): Promise<QueueStatus> {
  const result = await clientFetch<Record<string, unknown>>(
    `/queue/${businessId}/status`,
  );
  return toQueueStatus(result);
}

export async function clientGetQueueActiveCount(businessId: string): Promise<number> {
  const result = await authFetch<Record<string, unknown>[]>(`/queue/${businessId}/entries`);
  return result.filter((e) => e.status === "waiting" || e.status === "called").length;
}

export async function clientGetPublicQueueService(businessId: string): Promise<QueueServiceDay> {
  return toQueueServiceDay(await clientFetch<Record<string, unknown>>(`/queue/${businessId}/service`));
}

export async function clientGetQueueServiceDay(): Promise<QueueServiceDay> {
  return toQueueServiceDay(await authFetch<Record<string, unknown>>(`/queue/service-day`));
}

export async function clientSetQueueServiceDay(status: "open" | "closed", maxWaitingCovers: number): Promise<QueueServiceDay> {
  return toQueueServiceDay(await authFetch<Record<string, unknown>>(`/queue/service-day`, {
    method: "PUT",
    body: JSON.stringify({ status, max_waiting_covers: maxWaitingCovers }),
  }));
}

export async function clientGetQueueEntries(businessId: string): Promise<QueueEntry[]> {
  void businessId;
  const result = await authFetch<Record<string, unknown>[]>(`/queue/entries`);
  return result.map(toQueueEntry);
}

export async function clientNotifyQueueEntry(
  businessId: string,
  entryId: string,
): Promise<QueueEntry> {
  void businessId;
  const result = await authFetch<Record<string, unknown>>(
    `/queue/entries/${entryId}/call`,
    { method: "POST" },
  );
  return toQueueEntry(result);
}

export async function clientRetryQueueDelivery(entryId: string): Promise<QueueEntry> {
  return toQueueEntry(await authFetch<Record<string, unknown>>(`/queue/entries/${entryId}/delivery/retry`, { method: "POST" }));
}

export async function clientCreateStaffWalkIn(data: { name: string; partySize: number; phone?: string; idempotencyKey: string }): Promise<QueueStatus> {
  return toQueueStatus(await authFetch<Record<string, unknown>>(`/queue/entries`, {
    method: "POST",
    body: JSON.stringify({ name: data.name, party_size: data.partySize, phone: data.phone, idempotency_key: data.idempotencyKey }),
  }));
}

export async function clientRemoveQueueEntry(
  businessId: string,
  entryId: string,
  reasonCode: "guest_left" | "no_show" | "staff_removed",
  note?: string,
): Promise<QueueEntry> {
  void businessId;
  return toQueueEntry(await authFetch<Record<string, unknown>>(`/queue/entries/${entryId}/remove`, {
    method: "POST",
    body: JSON.stringify({ reason_code: reasonCode, note }),
  }));
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
    preparationStationId: (i.preparation_station_id as string) || undefined,
    routesToAllStations: (i.routes_to_all_stations as boolean) ?? false,
    prepTimeMinutes: (i.prep_time_minutes as number) || undefined,
    displayOrder: i.display_order as number,
    image: (i.image as string) || undefined,
    taxProfileId: i.tax_profile_id as string,
    taxProfileCode: (i.tax_profile_code as string) || undefined,
    taxProfileName: (i.tax_profile_name as string) || undefined,
    taxRate: i.tax_rate === null || i.tax_rate === undefined ? undefined : toMoney(i.tax_rate),
    priceIncludesTax: i.price_includes_tax as boolean | undefined,
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
    id: (o.id as string) ?? `public-order-${String(o.placed_at)}`,
    businessId: (o.business_id as string) ?? "",
    locationId: (o.location_id as string) || undefined,
    tableId: (o.table_id as string) || undefined,
    tabId: (o.tab_id as string) || undefined,
    tableIdentifier: (o.table_identifier as string) || undefined,
    status: o.status as Order["status"],
    idempotencyKey: (o.idempotency_key as string) ?? "",
    currencyCode: o.currency_code as string,
    subtotalAmount: toMoney(o.subtotal_amount),
    taxAmount: toMoney(o.tax_amount),
    // total_amount / prices are Decimal on the backend; toMoney guarantees the
    // declared `number` type regardless of wire format (see lib/money.ts).
    totalAmount: toMoney(o.total_amount),
    notes: (o.notes as string) || undefined,
    placedAt: o.placed_at as string,
    cancelledBy: (o.cancelled_by as string) || undefined,
    cancelledAt: (o.cancelled_at as string) || undefined,
    cancellationReason: (o.cancellation_reason as string) || undefined,
    lineItems: lineItems.map((li) => ({
      id: (li.id as string) ?? `public-line-${String(li.item_name)}`,
      orderId: (li.order_id as string) ?? "",
      itemId: (li.item_id as string) || undefined,
      itemName: li.item_name as string,
      quantity: Number(li.quantity),
      unitPrice: toMoney(li.unit_price),
      currencyCode: li.currency_code as string,
      taxProfileId: (li.tax_profile_id as string) || undefined,
      taxProfileVersionId: (li.tax_profile_version_id as string) || undefined,
      taxProfileName: li.tax_profile_name as string,
      taxProfileCode: li.tax_profile_code as string,
      taxRate: toMoney(li.tax_rate),
      priceIncludesTax: li.price_includes_tax as boolean,
      subtotalAmount: toMoney(li.subtotal_amount),
      taxAmount: toMoney(li.tax_amount),
      totalAmount: toMoney(li.total_amount),
      selectedModifiers: ((li.selected_modifiers as Record<string, unknown>[]) ?? []).map((s) => ({
        modifierId: s.modifier_id as string,
        name: s.name as string,
        priceDelta: toMoney(s.price_delta),
      })),
      routingTag: li.routing_tag as string,
      preparationStationId: (li.preparation_station_id as string) || undefined,
      preparationStationName: (li.preparation_station_name as string) || undefined,
      routesToAllStations: (li.routes_to_all_stations as boolean) ?? false,
      lineStatus: li.line_status as OrderLineItem["lineStatus"],
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

export interface PublicTableSession {
  status: "pending" | "approved" | "denied" | "revoked";
  tableLabel: string;
  expiresAt: string;
}

function toPublicTableSession(value: Record<string, unknown>): PublicTableSession {
  return {
    status: value.status as PublicTableSession["status"],
    tableLabel: value.table_label as string,
    expiresAt: value.expires_at as string,
  };
}

export async function clientCreateTableSession(
  businessId: string,
  tableToken: string,
  browserNonce: string,
): Promise<PublicTableSession> {
  const result = await clientFetch<Record<string, unknown>>(
    `/ordering/${businessId}/table-sessions`,
    {
      method: "POST",
      body: JSON.stringify({ table_token: tableToken, browser_nonce: browserNonce }),
    },
  );
  return toPublicTableSession(result);
}

export async function clientGetCurrentTableSession(
  businessId: string,
): Promise<PublicTableSession> {
  return toPublicTableSession(
    await clientFetch<Record<string, unknown>>(
      `/ordering/${businessId}/table-sessions/current`,
    ),
  );
}

export async function clientExchangePublicCapability(
  kind: "reservation" | "waitlist_manage" | "waitlist_offer" | "password_reset" | "staff_invite",
  token: string,
): Promise<void> {
  await clientFetch(`/public/capabilities/exchange`, {
    method: "POST",
    body: JSON.stringify({ kind, token }),
  });
}

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
): Promise<Order[]> {
  const result = await clientFetch<Record<string, unknown>[]>(
    `/ordering/${businessId}/orders/status`,
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

export async function clientAdvanceOrderLineStatus(
  businessId: string,
  orderId: string,
  lineId: string,
  status: OrderLineItem["lineStatus"],
): Promise<Order> {
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/orders/${orderId}/lines/${lineId}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
  return toOrder(result);
}

export async function clientCorrectOrder(
  businessId: string,
  orderId: string,
  data: {
    items: Array<{ itemId: string; quantity: number; selectedModifiers?: Array<{ modifierId: string }>; notes?: string }>;
    notes?: string;
    reason: string;
    idempotencyKey: string;
  },
): Promise<Order> {
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/orders/${orderId}/correct`,
    {
      method: "POST",
      body: JSON.stringify({
        items: data.items.map((item) => ({
          item_id: item.itemId,
          quantity: item.quantity,
          selected_modifiers: (item.selectedModifiers ?? []).map((modifier) => ({ modifier_id: modifier.modifierId })),
          notes: item.notes,
        })),
        notes: data.notes,
        reason: data.reason,
        idempotency_key: data.idempotencyKey,
      }),
    },
  );
  return toOrder(result);
}

export async function clientCancelOrder(
  businessId: string,
  orderId: string,
  reason: string,
  idempotencyKey: string,
): Promise<Order> {
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/orders/${orderId}/cancel`,
    { method: "POST", body: JSON.stringify({ reason, idempotency_key: idempotencyKey }) },
  );
  return toOrder(result);
}

export async function clientGetOrderAllDayCounts(): Promise<OrderAllDayCount[]> {
  const result = await authFetch<Record<string, unknown>[]>("/ordering/all-day-counts");
  return result.map((row) => ({
    preparationStationId: (row.preparation_station_id as string) || undefined,
    preparationStationName: (row.preparation_station_name as string) || undefined,
    routesToAllStations: (row.routes_to_all_stations as boolean) ?? false,
    itemName: row.item_name as string,
    lineStatus: row.line_status as string,
    quantity: Number(row.quantity),
  }));
}

function toPreparationStation(row: Record<string, unknown>): PreparationStation {
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    name: row.name as string,
    sortOrder: Number(row.sort_order),
    isActive: row.is_active as boolean,
  };
}

export async function clientGetPreparationStations(): Promise<PreparationStation[]> {
  return (await authFetch<Record<string, unknown>[]>("/ordering/stations")).map(toPreparationStation);
}

export async function clientCreatePreparationStation(name: string, sortOrder = 0): Promise<PreparationStation> {
  const result = await authFetch<Record<string, unknown>>("/ordering/stations", {
    method: "POST",
    body: JSON.stringify({ name, sort_order: sortOrder }),
  });
  return toPreparationStation(result);
}

export async function clientUpdatePreparationStation(
  stationId: string,
  data: { name?: string; sortOrder?: number },
): Promise<PreparationStation> {
  const result = await authFetch<Record<string, unknown>>(`/ordering/stations/${stationId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: data.name, sort_order: data.sortOrder }),
  });
  return toPreparationStation(result);
}

export async function clientArchivePreparationStation(stationId: string): Promise<void> {
  await authFetch(`/ordering/stations/${stationId}/archive`, { method: "POST" });
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
    currentSettlementEventId: (t.current_settlement_event_id as string) || undefined,
    settlementEvents: ((t.settlement_events as Record<string, unknown>[]) ?? []).map((event) => ({
      id: event.id as string,
      eventType: event.event_type as string,
      actorId: (event.actor_id as string) || undefined,
      occurredAt: event.occurred_at as string,
      currencyCode: event.currency_code as string,
      totalSnapshot: toMoney(event.total_snapshot),
      informationalMethod: (event.informational_method as TabSettledMethod) || undefined,
      note: (event.note as string) || undefined,
      externalRegisterReference: (event.external_register_reference as string) || undefined,
      relatedSettlementEventId: (event.related_settlement_event_id as string) || undefined,
    })),
    total: toMoney(t.total),
    orders: ((t.orders as Record<string, unknown>[]) ?? []).map(toOrder),
  };
}

export async function clientListTabs(
  status?: "open" | "settled_externally",
): Promise<Tab[]> {
  const q = status ? `?status=${status}` : "";
  const result = await authFetch<Record<string, unknown>[]>(`/tabs${q}`);
  return result.map(toTab);
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

export async function clientSettleTabExternally(
  tabId: string,
  data: {
    idempotencyKey: string;
    informationalMethod?: TabSettledMethod;
    note?: string;
    externalRegisterReference?: string;
  },
): Promise<Tab> {
  const result = await authFetch<Record<string, unknown>>(
    `/tabs/${tabId}/settle-externally`,
    {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: data.idempotencyKey,
        informational_method: data.informationalMethod,
        note: data.note,
        external_register_reference: data.externalRegisterReference,
      }),
    },
  );
  return toTab(result);
}

export async function clientReopenTab(
  tabId: string,
  reason: string,
  idempotencyKey: string,
): Promise<Tab> {
  const result = await authFetch<Record<string, unknown>>(`/tabs/${tabId}/reopen`, {
    method: "POST",
    body: JSON.stringify({ reason, idempotency_key: idempotencyKey }),
  });
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
    preparationStationId?: string;
    routesToAllStations?: boolean;
    prepTimeMinutes?: number;
    displayOrder?: number;
    image?: string;
    taxProfileId?: string;
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
        preparation_station_id: data.preparationStationId,
        routes_to_all_stations: data.routesToAllStations ?? !data.preparationStationId,
        prep_time_minutes: data.prepTimeMinutes,
        display_order: data.displayOrder ?? 0,
        image: data.image,
        tax_profile_id: data.taxProfileId,
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
    preparationStationId?: string | null;
    routesToAllStations?: boolean;
    prepTimeMinutes?: number;
    displayOrder?: number;
    image?: string;
    taxProfileId?: string;
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
  if (data.preparationStationId !== undefined) body.preparation_station_id = data.preparationStationId;
  if (data.routesToAllStations !== undefined) body.routes_to_all_stations = data.routesToAllStations;
  if (data.prepTimeMinutes !== undefined) body.prep_time_minutes = data.prepTimeMinutes;
  if (data.displayOrder !== undefined) body.display_order = data.displayOrder;
  if (data.image !== undefined) body.image = data.image;
  if (data.taxProfileId !== undefined) body.tax_profile_id = data.taxProfileId;
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/items/${itemId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return toMenuItem(result);
}

export async function clientSetItemAvailability(
  businessId: string,
  itemId: string,
  isAvailable: boolean,
  reason?: string,
): Promise<MenuItem> {
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/items/${itemId}/availability`,
    { method: "PUT", body: JSON.stringify({ is_available: isAvailable, reason }) },
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
    preparationStationId: (d.preparation_station_id as string) || undefined,
    routesToAllStations: (d.routes_to_all_stations as boolean) ?? false,
    prepTimeMinutes: d.prep_time_minutes as number | undefined,
    taxProfileId: d.tax_profile_id as string,
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
  data: { name: string; description?: string; price: number; preparationStationId?: string; routesToAllStations?: boolean; prepTimeMinutes?: number; taxProfileId?: string },
): Promise<LibraryItem> {
  const result = await authFetch<Record<string, unknown>>(
    `/ordering/${businessId}/library`,
    {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        description: data.description,
        price: data.price,
        preparation_station_id: data.preparationStationId,
        routes_to_all_stations: data.routesToAllStations ?? !data.preparationStationId,
        prep_time_minutes: data.prepTimeMinutes,
        tax_profile_id: data.taxProfileId,
      }),
    },
  );
  return toLibraryItem(result);
}

export async function clientUpdateLibraryItem(
  businessId: string,
  itemId: string,
  data: { name?: string; description?: string; price?: number; preparationStationId?: string | null; routesToAllStations?: boolean; prepTimeMinutes?: number; taxProfileId?: string },
): Promise<LibraryItem> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.description !== undefined) body.description = data.description;
  if (data.price !== undefined) body.price = data.price;
  if (data.preparationStationId !== undefined) body.preparation_station_id = data.preparationStationId;
  if (data.routesToAllStations !== undefined) body.routes_to_all_stations = data.routesToAllStations;
  if (data.prepTimeMinutes !== undefined) body.prep_time_minutes = data.prepTimeMinutes;
  if (data.taxProfileId !== undefined) body.tax_profile_id = data.taxProfileId;
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

// ─── Staff Invitations ────────────────────────────────────────────────────────

export interface StaffInvitation {
  id: string;
  email: string;
  role: StaffRole;
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

export async function clientGetInvite(): Promise<{
  email: string;
  role: string;
  business_name: string;
} | null> {
  try {
    return await clientFetch(`/staff/invite`);
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

// ─── Purchasing ───────────────────────────────────────────────────────────────

function toSupplier(raw: Record<string, unknown>): Supplier {
  return {
    id: raw.id as string,
    businessId: raw.business_id as string,
    name: raw.name as string,
    contactName: (raw.contact_name as string) || undefined,
    email: (raw.email as string) || undefined,
    phone: (raw.phone as string) || undefined,
    address: (raw.address as string) || undefined,
    notes: (raw.notes as string) || undefined,
    isActive: raw.is_active as boolean,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

function toSupplierProduct(raw: Record<string, unknown>): SupplierProduct {
  return {
    id: raw.id as string,
    businessId: raw.business_id as string,
    supplierId: raw.supplier_id as string,
    inventoryItemId: raw.inventory_item_id as string,
    supplierSku: (raw.supplier_sku as string) || undefined,
    productName: raw.product_name as string,
    packConversionId: (raw.pack_conversion_id as string) || undefined,
    leadTimeDays: Number(raw.lead_time_days ?? 0),
    lastPrice: toOptionalMoney(raw.last_price),
    currencyCode: raw.currency_code as string,
    isActive: raw.is_active as boolean,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

function toPackConversion(raw: Record<string, unknown>): PackConversion {
  return {
    id: raw.id as string,
    businessId: raw.business_id as string,
    inventoryItemId: raw.inventory_item_id as string,
    label: raw.label as string,
    packUnit: raw.pack_unit as PackConversion["packUnit"],
    baseQuantity: toMoney(raw.base_quantity),
    isDefaultReceivingUnit: raw.is_default_receiving_unit as boolean,
  };
}

function toPurchaseOrderLine(raw: Record<string, unknown>): PurchaseOrderLine {
  return {
    id: raw.id as string,
    inventoryItemId: raw.inventory_item_id as string,
    supplierProductId: (raw.supplier_product_id as string) || undefined,
    description: raw.description as string,
    orderedQuantity: toMoney(raw.ordered_quantity),
    receivedQuantity: toMoney(raw.received_quantity),
    packConversionId: raw.pack_conversion_id as string,
    unitPrice: toMoney(raw.unit_price),
    currencyCode: raw.currency_code as string,
  };
}

function toPurchaseOrder(raw: Record<string, unknown>): PurchaseOrder {
  return {
    id: raw.id as string,
    businessId: raw.business_id as string,
    supplierId: raw.supplier_id as string,
    locationId: (raw.location_id as string) || undefined,
    status: raw.status as PurchaseOrder["status"],
    reference: (raw.reference as string) || undefined,
    expectedOn: (raw.expected_on as string) || undefined,
    note: (raw.note as string) || undefined,
    approvedBy: (raw.approved_by as string) || undefined,
    approvedAt: (raw.approved_at as string) || undefined,
    orderedAt: (raw.ordered_at as string) || undefined,
    closedAt: (raw.closed_at as string) || undefined,
    closedBy: (raw.closed_by as string) || undefined,
    closureReason: (raw.closure_reason as string) || undefined,
    lines: ((raw.lines as Record<string, unknown>[]) ?? []).map(toPurchaseOrderLine),
  };
}

function toPurchaseReceipt(raw: Record<string, unknown>): PurchaseReceipt {
  return {
    id: raw.id as string,
    businessId: raw.business_id as string,
    purchaseOrderId: raw.purchase_order_id as string,
    deliveryReference: (raw.delivery_reference as string) || undefined,
    invoiceReference: (raw.invoice_reference as string) || undefined,
    receivedAt: raw.received_at as string,
    note: (raw.note as string) || undefined,
    purchaseOrderStatus: raw.purchase_order_status as PurchaseOrder["status"],
    lines: ((raw.lines as Record<string, unknown>[]) ?? []).map((line) => ({
      id: line.id as string,
      purchaseOrderLineId: line.purchase_order_line_id as string,
      inventoryItemId: line.inventory_item_id as string,
      receivedQuantity: toMoney(line.received_quantity),
      unitPrice: toMoney(line.unit_price),
      currencyCode: line.currency_code as string,
      substitutionNote: (line.substitution_note as string) || undefined,
      discrepancyReason: (line.discrepancy_reason as string) || undefined,
      stockMovementId: (line.stock_movement_id as string) || undefined,
    })),
  };
}

export async function clientGetSuppliers(
  businessId: string,
  includeArchived = false,
): Promise<Supplier[]> {
  const params = includeArchived ? "?include_archived=true" : "";
  const result = await authFetch<Record<string, unknown>[]>(
    `/purchasing/${businessId}/suppliers${params}`,
  );
  return (result ?? []).map(toSupplier);
}

export async function clientCreateSupplier(
  businessId: string,
  data: {
    name: string;
    contactName?: string;
    email?: string;
    phone?: string;
    address?: string;
    notes?: string;
  },
): Promise<Supplier> {
  const body: Record<string, unknown> = { name: data.name };
  if (data.contactName !== undefined) body.contact_name = data.contactName;
  if (data.email !== undefined) body.email = data.email;
  if (data.phone !== undefined) body.phone = data.phone;
  if (data.address !== undefined) body.address = data.address;
  if (data.notes !== undefined) body.notes = data.notes;
  const result = await authFetch<Record<string, unknown>>(
    `/purchasing/${businessId}/suppliers`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return toSupplier(result);
}

export async function clientUpdateSupplier(
  businessId: string,
  supplierId: string,
  data: {
    name?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    address?: string;
    notes?: string;
  },
): Promise<Supplier> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.contactName !== undefined) body.contact_name = data.contactName;
  if (data.email !== undefined) body.email = data.email;
  if (data.phone !== undefined) body.phone = data.phone;
  if (data.address !== undefined) body.address = data.address;
  if (data.notes !== undefined) body.notes = data.notes;
  const result = await authFetch<Record<string, unknown>>(
    `/purchasing/${businessId}/suppliers/${supplierId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return toSupplier(result);
}

export async function clientArchiveSupplier(
  businessId: string,
  supplierId: string,
): Promise<Supplier> {
  const result = await authFetch<Record<string, unknown>>(
    `/purchasing/${businessId}/suppliers/${supplierId}/archive`,
    { method: "POST" },
  );
  return toSupplier(result);
}

export async function clientGetSupplierProducts(
  businessId: string,
  supplierId?: string,
): Promise<SupplierProduct[]> {
  const qs = new URLSearchParams();
  if (supplierId) qs.set("supplier_id", supplierId);
  const params = qs.toString() ? `?${qs.toString()}` : "";
  const result = await authFetch<Record<string, unknown>[]>(
    `/purchasing/${businessId}/supplier-products${params}`,
  );
  return (result ?? []).map(toSupplierProduct);
}

export async function clientCreateSupplierProduct(
  businessId: string,
  supplierId: string,
  data: {
    inventoryItemId: string;
    productName: string;
    supplierSku?: string;
    packConversionId?: string;
    leadTimeDays?: number;
    lastPrice?: number;
  },
): Promise<SupplierProduct> {
  const body: Record<string, unknown> = {
    inventory_item_id: data.inventoryItemId,
    product_name: data.productName,
  };
  if (data.supplierSku !== undefined) body.supplier_sku = data.supplierSku;
  if (data.packConversionId !== undefined) body.pack_conversion_id = data.packConversionId;
  if (data.leadTimeDays !== undefined) body.lead_time_days = data.leadTimeDays;
  if (data.lastPrice !== undefined) body.last_price = data.lastPrice;
  const result = await authFetch<Record<string, unknown>>(
    `/purchasing/${businessId}/suppliers/${supplierId}/products`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return toSupplierProduct(result);
}

export async function clientArchiveSupplierProduct(
  businessId: string,
  supplierProductId: string,
): Promise<SupplierProduct> {
  const result = await authFetch<Record<string, unknown>>(
    `/purchasing/${businessId}/supplier-products/${supplierProductId}/archive`,
    { method: "POST" },
  );
  return toSupplierProduct(result);
}

export async function clientGetPurchaseOrders(
  businessId: string,
  status?: string,
): Promise<PurchaseOrder[]> {
  const qs = new URLSearchParams();
  if (status) qs.set("order_status", status);
  const params = qs.toString() ? `?${qs.toString()}` : "";
  const result = await authFetch<Record<string, unknown>[]>(
    `/purchasing/${businessId}/purchase-orders${params}`,
  );
  return (result ?? []).map(toPurchaseOrder);
}

export async function clientCreatePurchaseOrder(
  businessId: string,
  data: {
    supplierId: string;
    reference?: string;
    expectedOn?: string;
    note?: string;
    lines: {
      inventoryItemId: string;
      packConversionId: string;
      description: string;
      orderedQuantity: number;
      unitPrice: number;
      supplierProductId?: string;
    }[];
  },
): Promise<PurchaseOrder> {
  const body: Record<string, unknown> = {
    supplier_id: data.supplierId,
    lines: data.lines.map((line) => {
      const mapped: Record<string, unknown> = {
        inventory_item_id: line.inventoryItemId,
        pack_conversion_id: line.packConversionId,
        description: line.description,
        ordered_quantity: line.orderedQuantity,
        unit_price: line.unitPrice,
      };
      if (line.supplierProductId !== undefined) {
        mapped.supplier_product_id = line.supplierProductId;
      }
      return mapped;
    }),
  };
  if (data.reference !== undefined) body.reference = data.reference;
  if (data.expectedOn !== undefined) body.expected_on = data.expectedOn;
  if (data.note !== undefined) body.note = data.note;
  const result = await authFetch<Record<string, unknown>>(
    `/purchasing/${businessId}/purchase-orders`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return toPurchaseOrder(result);
}

export async function clientUpdatePurchaseOrderStatus(
  businessId: string,
  purchaseOrderId: string,
  status: string,
  closureReason?: string,
): Promise<PurchaseOrder> {
  const body: Record<string, unknown> = { status };
  if (closureReason !== undefined) body.closure_reason = closureReason;
  const result = await authFetch<Record<string, unknown>>(
    `/purchasing/${businessId}/purchase-orders/${purchaseOrderId}/status`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return toPurchaseOrder(result);
}

export async function clientReceivePurchaseOrder(
  businessId: string,
  purchaseOrderId: string,
  data: {
    idempotencyKey: string;
    deliveryReference?: string;
    invoiceReference?: string;
    note?: string;
    lines: {
      purchaseOrderLineId: string;
      receivedQuantity: number;
      unitPrice: number;
      substitutionNote?: string;
      discrepancyReason?: string;
    }[];
  },
): Promise<PurchaseReceipt> {
  const body: Record<string, unknown> = {
    idempotency_key: data.idempotencyKey,
    lines: data.lines.map((line) => {
      const mapped: Record<string, unknown> = {
        purchase_order_line_id: line.purchaseOrderLineId,
        received_quantity: line.receivedQuantity,
        unit_price: line.unitPrice,
      };
      if (line.substitutionNote) mapped.substitution_note = line.substitutionNote;
      if (line.discrepancyReason) mapped.discrepancy_reason = line.discrepancyReason;
      return mapped;
    }),
  };
  if (data.deliveryReference !== undefined) body.delivery_reference = data.deliveryReference;
  if (data.invoiceReference !== undefined) body.invoice_reference = data.invoiceReference;
  if (data.note !== undefined) body.note = data.note;
  const result = await authFetch<Record<string, unknown>>(
    `/purchasing/${businessId}/purchase-orders/${purchaseOrderId}/receipts`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return toPurchaseReceipt(result);
}

export async function clientGetPriceHistory(
  businessId: string,
  itemId: string,
): Promise<PriceHistoryEntry[]> {
  const result = await authFetch<Record<string, unknown>[]>(
    `/purchasing/${businessId}/items/${itemId}/price-history`,
  );
  return (result ?? []).map((raw) => ({
    id: raw.id as string,
    inventoryItemId: raw.inventory_item_id as string,
    supplierProductId: (raw.supplier_product_id as string) || undefined,
    receiptLineId: (raw.receipt_line_id as string) || undefined,
    unitCostPerBaseUnit: toMoney(raw.unit_cost_per_base_unit),
    currencyCode: raw.currency_code as string,
    observedAt: raw.observed_at as string,
  }));
}

export async function clientGetPackConversions(
  businessId: string,
  itemId: string,
): Promise<PackConversion[]> {
  const result = await authFetch<Record<string, unknown>[]>(
    `/inventory/${businessId}/items/${itemId}/packs`,
  );
  return (result ?? []).map(toPackConversion);
}

export async function clientCreatePackConversion(
  businessId: string,
  itemId: string,
  data: {
    label: string;
    packUnit: string;
    baseQuantity: number;
    isDefaultReceivingUnit?: boolean;
  },
): Promise<PackConversion> {
  const result = await authFetch<Record<string, unknown>>(
    `/inventory/${businessId}/items/${itemId}/packs`,
    {
      method: "POST",
      body: JSON.stringify({
        label: data.label,
        pack_unit: data.packUnit,
        base_quantity: data.baseQuantity,
        is_default_receiving_unit: data.isDefaultReceivingUnit ?? false,
      }),
    },
  );
  return toPackConversion(result);
}

// ─── Count sessions ───────────────────────────────────────────────────────────

function toCountLine(raw: Record<string, unknown>): CountLine {
  return {
    id: raw.id as string,
    inventoryItemId: raw.inventory_item_id as string,
    itemName: raw.item_name as string,
    baseUnit: raw.base_unit as string,
    bookQuantity: toMoney(raw.book_quantity),
    countedQuantity: toMoney(raw.counted_quantity),
    varianceQuantity: toMoney(raw.variance_quantity),
    shrinkageReason: (raw.shrinkage_reason as string) || undefined,
    note: (raw.note as string) || undefined,
    movementId: (raw.movement_id as string) || undefined,
    entryMode: (raw.entry_mode as CountLine["entryMode"]) ?? "base_unit",
    entryValue: toOptionalMoney(raw.entry_value),
    entryPackConversionId: (raw.entry_pack_conversion_id as string) || undefined,
  };
}

function toCountSessionSummary(raw: Record<string, unknown>): CountSessionSummary {
  return {
    id: raw.id as string,
    businessId: raw.business_id as string,
    locationId: (raw.location_id as string) || undefined,
    kind: raw.kind as CountSessionSummary["kind"],
    status: raw.status as CountSessionSummary["status"],
    note: (raw.note as string) || undefined,
    openedBy: (raw.opened_by as string) || undefined,
    reconciledBy: (raw.reconciled_by as string) || undefined,
    reconciledAt: (raw.reconciled_at as string) || undefined,
    createdAt: raw.created_at as string,
  };
}

function toCountSession(raw: Record<string, unknown>): CountSession {
  return {
    ...toCountSessionSummary(raw),
    lines: ((raw.lines as Record<string, unknown>[]) ?? []).map(toCountLine),
  };
}

export async function clientGetCountSessions(
  businessId: string,
  status?: string,
): Promise<CountSessionSummary[]> {
  const qs = new URLSearchParams();
  if (status) qs.set("session_status", status);
  const params = qs.toString() ? `?${qs.toString()}` : "";
  const result = await authFetch<Record<string, unknown>[]>(
    `/inventory/${businessId}/counts${params}`,
  );
  return (result ?? []).map(toCountSessionSummary);
}

export async function clientGetCountSession(
  businessId: string,
  sessionId: string,
): Promise<CountSession> {
  const result = await authFetch<Record<string, unknown>>(
    `/inventory/${businessId}/counts/${sessionId}`,
  );
  return toCountSession(result);
}

export async function clientCreateCountSession(
  businessId: string,
  data: { kind: "stocktake" | "cycle_count"; note?: string; itemIds?: string[] },
): Promise<CountSession> {
  const body: Record<string, unknown> = { kind: data.kind };
  if (data.note !== undefined) body.note = data.note;
  if (data.itemIds !== undefined) body.item_ids = data.itemIds;
  const result = await authFetch<Record<string, unknown>>(
    `/inventory/${businessId}/counts`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return toCountSession(result);
}

// Each line supplies exactly one of countedQuantity, packQuantity or
// kegLevelPercent; the server converts the latter two to base units.
export async function clientSaveCountLines(
  businessId: string,
  sessionId: string,
  lines: {
    countLineId: string;
    countedQuantity?: number;
    packConversionId?: string;
    packQuantity?: number;
    kegLevelPercent?: number;
    shrinkageReason?: string;
    note?: string;
  }[],
): Promise<CountSession> {
  const body = lines.map((line) => {
    const mapped: Record<string, unknown> = { count_line_id: line.countLineId };
    if (line.countedQuantity !== undefined) mapped.counted_quantity = line.countedQuantity;
    if (line.packConversionId !== undefined) mapped.pack_conversion_id = line.packConversionId;
    if (line.packQuantity !== undefined) mapped.pack_quantity = line.packQuantity;
    if (line.kegLevelPercent !== undefined) mapped.keg_level_percent = line.kegLevelPercent;
    if (line.shrinkageReason !== undefined) mapped.shrinkage_reason = line.shrinkageReason;
    if (line.note !== undefined) mapped.note = line.note;
    return mapped;
  });
  const result = await authFetch<Record<string, unknown>>(
    `/inventory/${businessId}/counts/${sessionId}/lines`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return toCountSession(result);
}

export async function clientReconcileCountSession(
  businessId: string,
  sessionId: string,
): Promise<CountSession> {
  const result = await authFetch<Record<string, unknown>>(
    `/inventory/${businessId}/counts/${sessionId}/reconcile`,
    { method: "POST" },
  );
  return toCountSession(result);
}

export async function clientCancelCountSession(
  businessId: string,
  sessionId: string,
): Promise<CountSessionSummary> {
  const result = await authFetch<Record<string, unknown>>(
    `/inventory/${businessId}/counts/${sessionId}/cancel`,
    { method: "POST" },
  );
  return toCountSessionSummary(result);
}

// ─── Cost control ─────────────────────────────────────────────────────────────

function toValuation(raw: Record<string, unknown>): InventoryValuation {
  return {
    items: ((raw.items as Record<string, unknown>[]) ?? []).map((item) => ({
      itemId: item.item_id as string,
      name: item.name as string,
      baseUnit: item.base_unit as string,
      quantity: toMoney(item.quantity),
      unitCost: toOptionalMoney(item.unit_cost),
      value: toMoney(item.value),
      costed: item.costed as boolean,
    })),
    totalValue: toMoney(raw.total_value),
    currencyCode: raw.currency_code as string,
    itemsWithoutCost: (raw.items_without_cost as string[]) ?? [],
    complete: raw.complete as boolean,
  };
}

function toReorderSuggestion(raw: Record<string, unknown>): ReorderSuggestion {
  const explanation = (raw.explanation ?? {}) as Record<string, unknown>;
  return {
    itemId: raw.item_id as string,
    itemName: raw.item_name as string,
    baseUnit: raw.base_unit as string,
    suggestedQuantity: toMoney(raw.suggested_quantity),
    explanation: {
      parQuantity: toMoney(explanation.par_quantity),
      averageConsumedPerDay: toMoney(explanation.average_consumed_per_day),
      leadTimeDays:
        explanation.lead_time_days === null || explanation.lead_time_days === undefined
          ? null
          : Number(explanation.lead_time_days),
      leadTimeCover: toMoney(explanation.lead_time_cover),
      targetQuantity: toMoney(explanation.target_quantity),
      onHand: toMoney(explanation.on_hand),
      outstandingOnOrder: toMoney(explanation.outstanding_on_order),
      lookbackDays: Number(explanation.lookback_days ?? 0),
      formula: explanation.formula as string,
      leadTimeKnown: explanation.lead_time_known as boolean,
    },
  };
}

export async function clientGetCostControl(businessId: string): Promise<CostControlOverview> {
  const result = await authFetch<Record<string, unknown>>(
    `/inventory/${businessId}/cost-control`,
  );
  return {
    valuation: toValuation(result.valuation as Record<string, unknown>),
    reorderSuggestions: ((result.reorder_suggestions as Record<string, unknown>[]) ?? []).map(
      toReorderSuggestion,
    ),
    disclosure: result.disclosure as string,
  };
}

export async function clientGetMenuMargins(businessId: string): Promise<MenuMargins> {
  const result = await authFetch<Record<string, unknown>>(
    `/inventory/${businessId}/cost-control/margins`,
  );
  return {
    items: ((result.items as Record<string, unknown>[]) ?? []).map((row) => ({
      menuItemId: row.menu_item_id as string,
      menuItemName: row.menu_item_name as string,
      price: toMoney(row.price),
      ingredientCost: toMoney(row.ingredient_cost),
      grossMargin: row.gross_margin === null ? null : toMoney(row.gross_margin),
      grossMarginPercent:
        row.gross_margin_percent === null ? null : toMoney(row.gross_margin_percent),
      pourCostPercent: row.pour_cost_percent === null ? null : toMoney(row.pour_cost_percent),
      complete: row.complete as boolean,
      incompleteReason: (row.incomplete_reason as string) ?? null,
    })),
    currencyCode: result.currency_code as string,
    disclosure: result.disclosure as string,
  };
}

export async function clientGetConsumptionVariance(
  businessId: string,
  start: string,
  end: string,
): Promise<ConsumptionVariance> {
  const qs = new URLSearchParams({ start, end });
  const result = await authFetch<Record<string, unknown>>(
    `/inventory/${businessId}/cost-control/variance?${qs.toString()}`,
  );
  return {
    items: ((result.items as Record<string, unknown>[]) ?? []).map((row) => ({
      itemId: row.item_id as string,
      name: row.name as string,
      baseUnit: row.base_unit as string,
      soldQuantity: toMoney(row.sold_quantity),
      wasteQuantity: toMoney(row.waste_quantity),
      wasteByReason: ((row.waste_by_reason as Record<string, unknown>[]) ?? []).map((w) => ({
        reason: w.reason as string,
        quantity: toMoney(w.quantity),
      })),
      wasteValue: row.waste_value === null ? null : toMoney(row.waste_value),
      costed: row.costed as boolean,
    })),
    currencyCode: result.currency_code as string,
    start: result.start as string,
    end: result.end as string,
    totalWasteValue: toMoney(result.total_waste_value),
    disclosure: result.disclosure as string,
  };
}

export async function clientGetControllableCogs(
  businessId: string,
  start: string,
  end: string,
): Promise<ControllableCogs> {
  const qs = new URLSearchParams({ start, end });
  const result = await authFetch<Record<string, unknown>>(
    `/inventory/${businessId}/cost-control/cogs?${qs.toString()}`,
  );
  return {
    start: result.start as string,
    end: result.end as string,
    currencyCode: result.currency_code as string,
    soldCost: toMoney(result.sold_cost),
    wasteCost: toMoney(result.waste_cost),
    total: toMoney(result.total),
    movementsWithoutCost: Number(result.movements_without_cost ?? 0),
    complete: result.complete as boolean,
    disclosure: result.disclosure as string,
  };
}

// ─── Operational reports ──────────────────────────────────────────────────────
// Every report takes an explicit window; none renders a fixed period. The API
// echoes the window back, and the panels render it beside the figure.

export interface ReportWindow {
  start: string;
  end: string;
}

/** Shared by every report: was this figure computable, and if not, why not. */
interface ReportBase {
  window: ReportWindow;
  complete: boolean;
  incompleteReason: string | null;
  disclosure: string;
}

export interface ReservationOutcomesReport extends ReportBase {
  booked: number;
  covers: number;
  byStatus: Record<string, number>;
  completed: number;
  cancelled: number;
  lateCancellations: number;
  noShows: number;
  reconfirmed: number;
  /** Null when nothing was booked — deliberately not 0, which would read as
   *  "no no-shows" on a day the venue never opened. */
  noShowRatePercent: number | null;
  cancellationRatePercent: number | null;
  completionRatePercent: number | null;
}

export interface QueueConversionReport extends ReportBase {
  joined: number;
  seated: number;
  removed: number;
  byStatus: Record<string, number>;
  seatingConversionPercent: number | null;
  averageWaitMinutes: number | null;
  medianWaitMinutes: number | null;
  longestWaitMinutes: number | null;
  waitlistOffers: number;
  waitlistAccepted: number;
  waitlistAcceptancePercent: number | null;
}

export interface TableUtilizationRow {
  tableId: string;
  tableName: string;
  seatings: number;
  covers: number;
  averageTurnMinutes: number | null;
  stillOpen: number;
}

export interface TableUtilizationReport extends ReportBase {
  seatings: number;
  covers: number;
  bySource: Record<string, { seatings: number; covers: number }>;
  tables: TableUtilizationRow[];
  seatingsStillOpen: number;
}

export interface StationThroughputRow {
  station: string;
  quantity: number;
  lines: number;
  averageTicketMinutes?: number | null;
  medianTicketMinutes?: number | null;
  timedLines?: number;
  items: { itemName: string; quantity: number; lines: number }[];
}

export interface StationThroughputReport extends ReportBase {
  stations: StationThroughputRow[];
}

/**
 * The three value figures, kept apart on purpose.
 *
 * They are not summable and must never be labelled revenue, accounting output
 * or a fiscal total. `valueDisclosure` carries the wording the UI renders.
 */
export interface TabValueReport extends ReportBase {
  currencyCode: string;
  orderedValue: string;
  orders: number;
  openTabValue: string;
  openTabs: number;
  externallySettledValue: string;
  settlements: number;
  settlementMethods: {
    informationalMethod: string;
    settlements: number;
    externallySettledValue: string;
  }[];
  valueDisclosure: string;
}

export interface StockActivityReport extends ReportBase {
  currencyCode: string;
  movementsByType: { movementType: string; movements: number; quantity: number }[];
  waste: {
    reason: string;
    itemName: string;
    movements: number;
    quantity: number;
    wasteValue: string;
  }[];
  totalWasteValue: string;
  reconciledCounts: {
    sessionId: string;
    kind: string;
    reconciledAt: string | null;
    lines: number;
    absoluteVariance: number;
  }[];
  movementsWithoutCost: number;
}

export interface PurchasingSpendReport extends ReportBase {
  currencyCode: string;
  totalReceivedValue: string;
  bySupplier: {
    supplierId: string;
    supplierName: string;
    receipts: number;
    receivedValue: string;
  }[];
  byItem: {
    itemId: string;
    itemName: string;
    packsReceived: number;
    receivedValue: string;
  }[];
  ordersByStatus: Record<string, number>;
  linesWithDiscrepancies: number;
}

export interface StaffActionsReport extends ReportBase {
  actors: {
    actorId: string;
    actorName: string;
    actions: Record<string, number>;
    total: number;
  }[];
  actions: { action: string; actorId: string; actorName: string; count: number }[];
}

function reportBase(raw: Record<string, unknown>): ReportBase {
  return {
    window: raw.window as ReportWindow,
    complete: Boolean(raw.complete),
    incompleteReason: (raw.incomplete_reason as string | null) ?? null,
    disclosure: (raw.disclosure as string) ?? "",
  };
}

function reportQuery(range: { start: string; end: string }): string {
  return new URLSearchParams({ start: range.start, end: range.end }).toString();
}

export async function clientGetReservationOutcomes(
  range: { start: string; end: string },
): Promise<ReservationOutcomesReport> {
  const raw = await authFetch<Record<string, unknown>>(
    `/reports/reservations?${reportQuery(range)}`,
  );
  return {
    ...reportBase(raw),
    booked: raw.booked as number,
    covers: raw.covers as number,
    byStatus: (raw.by_status as Record<string, number>) ?? {},
    completed: raw.completed as number,
    cancelled: raw.cancelled as number,
    lateCancellations: raw.late_cancellations as number,
    noShows: raw.no_shows as number,
    reconfirmed: raw.reconfirmed as number,
    noShowRatePercent: (raw.no_show_rate_percent as number | null) ?? null,
    cancellationRatePercent: (raw.cancellation_rate_percent as number | null) ?? null,
    completionRatePercent: (raw.completion_rate_percent as number | null) ?? null,
  };
}

export async function clientGetQueueConversion(
  range: { start: string; end: string },
): Promise<QueueConversionReport> {
  const raw = await authFetch<Record<string, unknown>>(
    `/reports/queue?${reportQuery(range)}`,
  );
  return {
    ...reportBase(raw),
    joined: raw.joined as number,
    seated: raw.seated as number,
    removed: raw.removed as number,
    byStatus: (raw.by_status as Record<string, number>) ?? {},
    seatingConversionPercent: (raw.seating_conversion_percent as number | null) ?? null,
    averageWaitMinutes: (raw.average_wait_minutes as number | null) ?? null,
    medianWaitMinutes: (raw.median_wait_minutes as number | null) ?? null,
    longestWaitMinutes: (raw.longest_wait_minutes as number | null) ?? null,
    waitlistOffers: raw.waitlist_offers as number,
    waitlistAccepted: raw.waitlist_accepted as number,
    waitlistAcceptancePercent:
      (raw.waitlist_acceptance_percent as number | null) ?? null,
  };
}

export async function clientGetTableUtilization(
  range: { start: string; end: string },
): Promise<TableUtilizationReport> {
  const raw = await authFetch<Record<string, unknown>>(
    `/reports/tables?${reportQuery(range)}`,
  );
  return {
    ...reportBase(raw),
    seatings: raw.seatings as number,
    covers: raw.covers as number,
    bySource: (raw.by_source as Record<string, { seatings: number; covers: number }>) ?? {},
    tables: ((raw.tables as Record<string, unknown>[]) ?? []).map((row) => ({
      tableId: row.table_id as string,
      tableName: row.table_name as string,
      seatings: row.seatings as number,
      covers: row.covers as number,
      averageTurnMinutes: (row.average_turn_minutes as number | null) ?? null,
      stillOpen: row.still_open as number,
    })),
    seatingsStillOpen: raw.seatings_still_open as number,
  };
}

export async function clientGetStationThroughput(
  range: { start: string; end: string },
): Promise<StationThroughputReport> {
  const raw = await authFetch<Record<string, unknown>>(
    `/reports/stations?${reportQuery(range)}`,
  );
  return {
    ...reportBase(raw),
    stations: ((raw.stations as Record<string, unknown>[]) ?? []).map((row) => ({
      station: row.station as string,
      quantity: row.quantity as number,
      lines: row.lines as number,
      averageTicketMinutes: (row.average_ticket_minutes as number | null) ?? null,
      medianTicketMinutes: (row.median_ticket_minutes as number | null) ?? null,
      timedLines: (row.timed_lines as number | undefined) ?? 0,
      items: ((row.items as Record<string, unknown>[]) ?? []).map((item) => ({
        itemName: item.item_name as string,
        quantity: item.quantity as number,
        lines: item.lines as number,
      })),
    })),
  };
}

export async function clientGetTabValue(
  range: { start: string; end: string },
): Promise<TabValueReport> {
  const raw = await authFetch<Record<string, unknown>>(
    `/reports/value?${reportQuery(range)}`,
  );
  return {
    ...reportBase(raw),
    currencyCode: raw.currency_code as string,
    orderedValue: String(raw.ordered_value),
    orders: raw.orders as number,
    openTabValue: String(raw.open_tab_value),
    openTabs: raw.open_tabs as number,
    externallySettledValue: String(raw.externally_settled_value),
    settlements: raw.settlements as number,
    settlementMethods: ((raw.settlement_methods as Record<string, unknown>[]) ?? []).map(
      (row) => ({
        informationalMethod: row.informational_method as string,
        settlements: row.settlements as number,
        externallySettledValue: String(row.externally_settled_value),
      }),
    ),
    valueDisclosure: (raw.value_disclosure as string) ?? "",
  };
}

export async function clientGetStockActivity(
  range: { start: string; end: string },
): Promise<StockActivityReport> {
  const raw = await authFetch<Record<string, unknown>>(
    `/reports/stock?${reportQuery(range)}`,
  );
  return {
    ...reportBase(raw),
    currencyCode: raw.currency_code as string,
    movementsByType: ((raw.movements_by_type as Record<string, unknown>[]) ?? []).map(
      (row) => ({
        movementType: row.movement_type as string,
        movements: row.movements as number,
        quantity: row.quantity as number,
      }),
    ),
    waste: ((raw.waste as Record<string, unknown>[]) ?? []).map((row) => ({
      reason: row.reason as string,
      itemName: row.item_name as string,
      movements: row.movements as number,
      quantity: row.quantity as number,
      wasteValue: String(row.waste_value),
    })),
    totalWasteValue: String(raw.total_waste_value),
    reconciledCounts: ((raw.reconciled_counts as Record<string, unknown>[]) ?? []).map(
      (row) => ({
        sessionId: row.session_id as string,
        kind: row.kind as string,
        reconciledAt: (row.reconciled_at as string | null) ?? null,
        lines: row.lines as number,
        absoluteVariance: row.absolute_variance as number,
      }),
    ),
    movementsWithoutCost: raw.movements_without_cost as number,
  };
}

export async function clientGetPurchasingSpend(
  range: { start: string; end: string },
): Promise<PurchasingSpendReport> {
  const raw = await authFetch<Record<string, unknown>>(
    `/reports/purchasing?${reportQuery(range)}`,
  );
  return {
    ...reportBase(raw),
    currencyCode: raw.currency_code as string,
    totalReceivedValue: String(raw.total_received_value),
    bySupplier: ((raw.by_supplier as Record<string, unknown>[]) ?? []).map((row) => ({
      supplierId: row.supplier_id as string,
      supplierName: row.supplier_name as string,
      receipts: row.receipts as number,
      receivedValue: String(row.received_value),
    })),
    byItem: ((raw.by_item as Record<string, unknown>[]) ?? []).map((row) => ({
      itemId: row.item_id as string,
      itemName: row.item_name as string,
      packsReceived: row.packs_received as number,
      receivedValue: String(row.received_value),
    })),
    ordersByStatus: (raw.orders_by_status as Record<string, number>) ?? {},
    linesWithDiscrepancies: raw.lines_with_discrepancies as number,
  };
}

export async function clientGetStaffActions(
  range: { start: string; end: string },
): Promise<StaffActionsReport> {
  const raw = await authFetch<Record<string, unknown>>(
    `/reports/staff-actions?${reportQuery(range)}`,
  );
  return {
    ...reportBase(raw),
    actors: ((raw.actors as Record<string, unknown>[]) ?? []).map((row) => ({
      actorId: row.actor_id as string,
      actorName: row.actor_name as string,
      actions: (row.actions as Record<string, number>) ?? {},
      total: row.total as number,
    })),
    actions: ((raw.actions as Record<string, unknown>[]) ?? []).map((row) => ({
      action: row.action as string,
      actorId: row.actor_id as string,
      actorName: row.actor_name as string,
      count: row.count as number,
    })),
  };
}

/**
 * Download a report as CSV.
 *
 * Served through the authenticated proxy, so it cannot be a plain link — the
 * same reason the count sheet builds a blob. `path` is the report slug, e.g.
 * "value" for /api/reports/value.csv.
 */
export async function clientDownloadReportCsv(
  path: string,
  range: { start: string; end: string },
  filename: string,
): Promise<void> {
  const response = await fetch(
    `/api/proxy/reports/${path}.csv?${reportQuery(range)}`,
  );
  if (!response.ok) throw new Error("Export failed");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

// ─── Guest-led privacy ────────────────────────────────────────────────────────
// Identity comes from the reservation capability cookie the guest already
// holds. These never take a customer id, an email or a phone number — accepting
// one would make the surface enumerable.

export type GuestPrivacyRequestType =
  | "export"
  | "correction"
  | "deletion"
  | "withdraw_consent";

export interface GuestPrivacyState {
  marketingConsent: Record<string, boolean>;
  privacyContact: string | null;
  privacyPolicyUrl: string | null;
}

export interface GuestPrivacyRequestResult {
  requestType: GuestPrivacyRequestType;
  status: "pending" | "completed";
  withdrawnChannels: string[];
  privacyContact: string | null;
  message: string;
}

export async function clientGetGuestPrivacyState(): Promise<GuestPrivacyState> {
  const raw = await clientFetch<Record<string, unknown>>("/public/privacy");
  return {
    marketingConsent: (raw.marketing_consent as Record<string, boolean>) ?? {},
    privacyContact: (raw.privacy_contact as string | null) ?? null,
    privacyPolicyUrl: (raw.privacy_policy_url as string | null) ?? null,
  };
}

export async function clientCreateGuestPrivacyRequest(
  requestType: GuestPrivacyRequestType,
  note?: string,
): Promise<GuestPrivacyRequestResult> {
  const raw = await clientFetch<Record<string, unknown>>("/public/privacy/requests", {
    method: "POST",
    body: JSON.stringify({ request_type: requestType, note: note ?? null }),
  });
  return {
    requestType: raw.request_type as GuestPrivacyRequestType,
    status: raw.status as "pending" | "completed",
    withdrawnChannels: (raw.withdrawn_channels as string[]) ?? [],
    privacyContact: (raw.privacy_contact as string | null) ?? null,
    message: raw.message as string,
  };
}
