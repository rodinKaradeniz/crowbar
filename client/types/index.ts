// Base user types
export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  avatar?: string;
  createdAt: string;
}

export interface Customer extends User {
  type: "customer";
}

export interface Staff extends User {
  type: "staff";
  businessId: string;
  role: "owner" | "manager" | "staff";
}

// Auth
export interface AuthInfo {
  userId: string;
  email: string;
  password: string; // In real app, this would be hashed
  type: "customer" | "staff";
}

// Business: Bar, Restaurant, Club, Consultant, Therapist, etc.
export interface Business {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string;
  timezone?: string; // IANA timezone name (e.g. "Europe/Istanbul"); mappers default to "UTC"
  countryCode?: string;
  currencyCode?: string;
  locale?: string;
  taxLabel?: string;
  legalDrinkingAge?: number; // age asserted at alcohol checkout; mappers default to 18
  address?: string;
  description?: string;
  image?: string;
  website?: string;
  tags?: string[];
  createdAt: string;
  maxGuests: number;
  reservationTime: number;
  timeSlotInterval: number;
  advanceBookingDays: number;
  operatingHours: {
    [day: string]:
      | { closed: true }
      | { open: string; close: string; closed?: false };
  };
  enabledModules: string[];
  onboardingComplete: boolean;
  notificationChannels: string[];
  isAcceptingOrders: boolean;
  publicReservationsEnabled: boolean;
}

export interface VisitorResponse {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: "reservation" | "walkin";
  visitCount: number;
  lastVisit: string | null;
  partySize: number | null;
}

export interface MeContext {
  user: {
    id: string;
    email: string;
    name: string;
    phone?: string;
    avatar?: string;
    userType: string;
  };
  business: Pick<Business, "id" | "name" | "slug" | "enabledModules" | "onboardingComplete" | "notificationChannels"> & {
    locations: Array<{ id: string; name: string; address?: string; is_primary: boolean }>;
  };
  role: "owner" | "manager" | "staff";
  permissions: string[];
  enabledModules: string[];
}

// Service Type - unified concept for bookable services/spaces
export interface ServiceType {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  capacity: number;
  maxConcurrentBookings?: number;
  availabilityResourceMode?: "legacy" | "tables" | "covers";
  reservableCoverCapacity?: number;
  resourceTurnBufferMinutes?: number;
  isPendingEnabled: boolean;
  duration?: number;
  color: string;
  displayOrder?: number;
  image?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookingTimeWindow {
  id?: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface BookingScheduleWindow extends BookingTimeWindow {
  weekday: number;
}

export interface BookingScheduleException {
  id?: string;
  localDate: string;
  isClosed: boolean;
  windows: BookingTimeWindow[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BookingSchedule {
  id: string;
  businessId: string;
  serviceTypeId?: string;
  minimumNoticeMinutes: number;
  advanceBookingDays: number;
  slotIntervalMinutes: number;
  defaultDurationMinutes: number;
  cancellationWindowMinutes: number;
  arrivalGracePeriodMinutes: number;
  reminderEnabled: boolean;
  reminderLeadMinutes: number;
  reconfirmationEnabled: boolean;
  windows: BookingScheduleWindow[];
  exceptions: BookingScheduleException[];
  createdAt: string;
  updatedAt: string;
}

export interface BookingScheduleDraft {
  minimumNoticeMinutes: number;
  advanceBookingDays: number;
  slotIntervalMinutes: number;
  defaultDurationMinutes: number;
  cancellationWindowMinutes: number;
  arrivalGracePeriodMinutes: number;
  reminderEnabled: boolean;
  reminderLeadMinutes: number;
  reconfirmationEnabled: boolean;
  windows: BookingScheduleWindow[];
  exceptions: BookingScheduleException[];
}

export interface BookingScheduleCollection {
  defaultSchedule: BookingSchedule;
  serviceOverrides: BookingSchedule[];
}

export interface BookingOperatingHoursPreview {
  currentWindows: BookingScheduleWindow[];
  proposedWindows: BookingScheduleWindow[];
}

export interface Notification {
  id: string;
  userId: string;
  businessId: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  /** Present when merging linked-email accounts; indicates origin role */
  sourceType?: "staff" | "customer" | string;
}

export interface QueueEntry {
  id: string;
  businessId: string;
  sessionToken: string;
  name: string;
  partySize: number;
  phone?: string;
  status: "waiting" | "called" | "seated" | "removed";
  position?: number;
  joinedAt: string;
  calledAt?: string;
  seatedAt?: string;
}

export interface QueueStatus {
  entry: QueueEntry;
  totalWaiting: number;
  estimatedWaitMinutes?: number;
}

// ─── Guest CRM ──────────────────────────────────────────────────────────────

export interface GuestTag {
  id: string;
  name: string;
  createdBy?: string;
  createdAt: string;
}

export interface GuestNote {
  id: string;
  title: string;
  body: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuestMarketingConsent {
  channel: "email" | "sms";
  isConsented: boolean;
  source: string;
  noticeVersion: string;
  capturedAt: string;
  withdrawnAt?: string;
}

export interface GuestTimelineEntry {
  id: string;
  kind: "reservation" | "queue" | "tab" | "order" | "note";
  occurredAt: string;
  title: string;
  detail?: string;
  amount?: number;
  status?: string;
}

export interface GuestProfile {
  id: string;
  businessId: string;
  name?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  preferences?: string;
  dietaryDetails?: string;
  dietaryDetailsSource?: string;
  dietaryDetailsRecordedAt?: string;
  anonymizedAt?: string;
  tags: GuestTag[];
  notes: GuestNote[];
  consents: GuestMarketingConsent[];
  timeline: GuestTimelineEntry[];
}

export interface GuestListItem {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
}

// ─── Floor plan ──────────────────────────────────────────────────────────────

export type TableOperationalState = "ready" | "cleaning" | "out_of_service";
export type FloorPlanDisplayState =
  | "available"
  | "reserved"
  | "occupied"
  | "cleaning"
  | "out_of_service";
export type FloorPlanSourceType = "reservation" | "queue";

export interface FloorPlanArea {
  id: string;
  businessId: string;
  locationId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface FloorPlanTable {
  id: string;
  businessId: string;
  locationId: string;
  areaId: string;
  label: string;
  capacity: number;
  shape: "round" | "square" | "rectangle" | "bar" | "booth";
  sortOrder: number;
  operationalState: TableOperationalState;
  operationalStateReason?: string;
  operationalStateUntil?: string;
  isActive: boolean;
}

export interface FloorPlanTableQr {
  tableId: string;
  label: string;
  revision: number;
  url: string;
}

export interface FloorPlanCombination {
  id: string;
  businessId: string;
  locationId: string;
  areaId: string;
  name: string;
  tableIds: string[];
  capacityOverride?: number;
  effectiveCapacity: number;
  isActive: boolean;
}

export interface FloorPlanSettings {
  serviceDayCutoff: string;
  timezone: string;
}

export interface FloorPlanParty {
  sourceType: FloorPlanSourceType;
  sourceId: string;
  name: string;
  partySize: number;
  status: string;
  startsAt?: string;
  endsAt?: string;
  assignedTableIds: string[];
  customerId?: string;
  guestContext?: {
    customerId: string;
    tags: string[];
    dietaryDetails?: string;
    preferences?: string;
  };
}

export interface FloorPlanAssignment {
  sourceType: FloorPlanSourceType;
  sourceId: string;
  tableIds: string[];
  assignedBy?: string;
  assignedAt: string;
  capacity: number;
  capacityOverrideReason?: string;
}

export interface FloorPlanSeating {
  seatingId: string;
  source: FloorPlanParty;
  tableIds: string[];
  openedAt: string;
  openTabId?: string;
}

export interface FloorPlanBoardTable {
  id: string;
  areaId: string;
  label: string;
  capacity: number;
  shape: string;
  sortOrder: number;
  displayState: FloorPlanDisplayState;
  operationalState: TableOperationalState;
  operationalStateReason?: string;
  operationalStateUntil?: string;
  operationalStateExpired: boolean;
  activeSeating?: FloorPlanSeating;
  activeAssignment?: FloorPlanParty;
  nextReservation?: FloorPlanParty;
}

export interface FloorPlanBoardArea {
  id: string;
  name: string;
  sortOrder: number;
  tables: FloorPlanBoardTable[];
}

export interface FloorPlanBoard {
  businessId: string;
  locationId: string;
  timezone: string;
  serviceDate: string;
  startsAt: string;
  endsAt: string;
  generatedAt: string;
  areas: FloorPlanBoardArea[];
  unassignedReservations: FloorPlanParty[];
  queueEntries: FloorPlanParty[];
}

// ─── Ordering ─────────────────────────────────────────────────────────────────

export interface Modifier {
  id: string;
  groupId: string;
  businessId: string;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
}

export interface ModifierGroup {
  id: string;
  itemId: string;
  businessId: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  modifiers: Modifier[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  businessId: string;
  name: string;
  description?: string;
  price: number;
  happyHourPrice?: number; // flat override; undefined = never discounts
  isAlcoholic?: boolean; // age-verification flag; drives the checkout attestation + staff badge
  isAvailable: boolean;
  routingTag: "kitchen" | "bar" | "any";
  prepTimeMinutes?: number;
  displayOrder: number;
  image?: string;
  taxProfileId: string;
  taxProfileCode?: string;
  taxProfileName?: string;
  taxRate?: number;
  priceIncludesTax?: boolean;
  modifierGroups: ModifierGroup[];
}

export interface MenuCategory {
  id: string;
  menuId: string;
  businessId: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  items: MenuItem[];
}

export interface Menu {
  id: string;
  businessId: string;
  locationId?: string;
  name: string;
  description?: string;
  isActive: boolean;
  happyHourActive?: boolean; // server-computed; only set on the public read path
  categories: MenuCategory[];
}

export interface HappyHourWindow {
  id: string;
  businessId: string;
  name: string;
  daysOfWeek: number[]; // 0=Monday..6=Sunday (see lib/days.ts)
  startTime: string; // "HH:MM" wall-clock in the business's timezone
  endTime: string;
  isActive: boolean;
}

export interface SelectedModifier {
  modifierId: string;
  name: string;
  priceDelta: number;
}

export interface OrderLineItem {
  id: string;
  orderId: string;
  itemId?: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  currencyCode: string;
  taxProfileId?: string;
  taxProfileVersionId?: string;
  taxProfileName: string;
  taxProfileCode: string;
  taxRate: number;
  priceIncludesTax: boolean;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  selectedModifiers: SelectedModifier[];
  routingTag: string;
  isAlcoholic?: boolean; // snapshot from the menu item at placement
  notes?: string;
}

export interface OrderStatusEvent {
  id: string;
  fromStatus?: string; // null on the initial 'received' placement row
  status: string;
  changedBy?: string;
  changedAt: string;
}

export interface Order {
  id: string;
  businessId: string;
  locationId?: string;
  tableId?: string;
  tabId?: string;
  sessionToken: string;
  tableIdentifier?: string;
  status: "received" | "preparing" | "ready" | "served" | "cancelled";
  idempotencyKey: string;
  currencyCode: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  placedAt: string;
  lineItems: OrderLineItem[];
  statusTimeline: OrderStatusEvent[];
}

export interface LibraryItem {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  price: number;
  routingTag: string;
  prepTimeMinutes?: number;
  taxProfileId: string;
}

export interface TaxProfileVersion {
  id: string;
  taxProfileId: string;
  businessId: string;
  name: string;
  rate: number;
  priceIncludesTax: boolean;
  effectiveFrom: string;
  note?: string;
  createdBy?: string;
  createdAt: string;
}

export interface TaxProfile {
  id: string;
  businessId: string;
  code: string;
  isActive: boolean;
  currentVersion?: TaxProfileVersion;
  versions: TaxProfileVersion[];
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegionalAudit {
  id: string;
  businessId: string;
  changedBy?: string;
  previousValues: Record<string, string>;
  newValues: Record<string, string>;
  changedAt: string;
}

export interface RegionalOption {
  code: string;
  name: string;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

export type TabSettledMethod = "cash" | "card" | "comp" | "other";

export interface Tab {
  id: string;
  businessId: string;
  tableId?: string;
  seatingId?: string;
  customerId?: string;
  status: "open" | "closed";
  channel: string;
  openedBy: string;
  openedAt: string;
  closedBy?: string;
  closedAt?: string;
  settledMethod?: TabSettledMethod;
  total: number; // computed live over associated orders
  orders: Order[];
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export type InventoryUnitType = "each" | "bottle" | "keg";

export interface InventoryItem {
  id: string;
  businessId: string;
  locationId?: string;
  name: string;
  unit: string;
  unitType: InventoryUnitType; // 'each' countable; 'bottle'/'keg' liquid tracked in ml
  containerVolumeMl?: number; // ml per container (bottle/keg); undefined for 'each'
  defaultPourMl?: number; // reference pour size (ml) for the pours-remaining estimate; undefined = no estimate
  currentQuantity: number; // ml for bottle/keg; count for 'each'
  parQuantity?: number;
  costPerUnit?: number;
  notes?: string;
  isActive: boolean;
  archivedAt?: string;
  isLowStock: boolean; // computed in mapper: parQuantity != null && currentQuantity < parQuantity
  createdAt: string;
  updatedAt: string;
}

// Structured cause for a waste movement (see migration 021). Enables later
// "how much do we typically waste per item" aggregation (Phase 9 ML V2).
export type WasteReason =
  | "spillage"
  | "wrong_measure"
  | "breakage"
  | "spoilage"
  | "other";

export interface StockMovement {
  id: string;
  businessId: string;
  locationId?: string;
  itemId: string;
  movementType: "receive" | "adjust" | "waste" | "sale" | "sale_reversal";
  quantityDelta: number;
  reason?: WasteReason; // structured cause on waste movements
  notes?: string;
  createdBy?: string;
  alertTriggered: boolean;
  createdAt: string;
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

// A recipe line: one inventory item consumed by a menu item. quantity is in the
// linked inventory item's native unit (ml for bottle/keg, count for 'each').
export interface RecipeIngredient {
  id: string;
  inventoryItemId: string;
  inventoryItemName: string;
  unitType: InventoryUnitType;
  unit: string;
  quantity: number;
}

// Per-menu-item stock info (only for items with a recipe). `servingsRemaining` is
// the recipe-exact live count of makeable servings (min floor across ingredients);
// `hasLowStockIngredient` drives the amber below-par badge.
export interface MenuItemStockInfo {
  menuItemId: string;
  hasLowStockIngredient: boolean;
  servingsRemaining: number | null;
}

export interface Reservation {
  id: string;
  businessId: string;
  customerId: string;
  serviceTypeId: string;
  time: string;
  /** Persisted occupied-interval end. Optional only for legacy mock fixtures. */
  endsAt?: string;
  phone?: string;
  email?: string;
  note?: string;
  status: "confirmed" | "pending" | "cancelled" | "completed" | "no_show";
  guests: number;
  availabilityOverrideBy?: string;
  availabilityOverrideActorName?: string;
  availabilityOverrideReason?: string;
  availabilityOverriddenAt?: string;
  cancelledAt?: string;
  cancelledBy?: "guest" | "staff";
  cancelledLate?: boolean;
  noShowAt?: string;
  noShowNote?: string;
  reconfirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationWaitlistEntry {
  id: string;
  businessId: string;
  serviceTypeId: string;
  customerId: string;
  requestedStartsAt: string;
  flexibleUntil: string;
  guests: number;
  status: "waiting" | "offered" | "accepted" | "expired" | "removed";
  offeredAt?: string;
  offeredReservationTime?: string;
  offerExpiresAt?: string;
  acceptedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilitySlot {
  startsAt: string;
  endsAt: string;
}

export interface AvailabilityDate {
  date: string;
  slots: AvailabilitySlot[];
}

export interface Availability {
  businessId: string;
  serviceTypeId: string;
  timezone: string;
  durationMinutes: number;
  slotIntervalMinutes: number;
  maxPartySize: number;
  dates: AvailabilityDate[];
}

// ── Insights / KPIs ──────────────────────────────────────────────────────────

export interface ReservationKpis {
  cancellationRate: number;
  completionRate: number;
  avgLeadTimeHours: number;
  occupancyByHour: { hour: number; count: number }[];
}

export interface OrderingKpis {
  avgPrepTimeMinutes: number;
  peakHours: { hour: number; count: number }[];
  topItems: { name: string; totalOrdered: number }[];
}

export interface InventoryKpis {
  totalMovements: number;
  wasteMovements: number;
  lowStockIncidents: number;
  itemsBelowPar: number;
}

export interface OperationalKpis {
  reservation: ReservationKpis;
  ordering: OrderingKpis | null;
  inventory: InventoryKpis | null;
}

export interface HighRiskReservation {
  id: string;
  time: string;
  guests: number;
  status: string;
  customerId: string;
  serviceTypeId: string;
  riskScore: number;
}
