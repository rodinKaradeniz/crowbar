// Base user types
export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  avatar?: string;
  createdAt: string;
}

export interface Staff extends User {
  type: "staff";
  businessId: string;
  role: "owner" | "manager" | "staff" | "staff_admin";
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
  isPendingEnabled: boolean;
  duration?: number;
  color: string;
  displayOrder?: number;
  image?: string;
  createdAt: string;
  updatedAt: string;
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
  sessionToken: string;
  tableIdentifier?: string;
  status: "received" | "preparing" | "ready" | "served" | "cancelled";
  idempotencyKey: string;
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
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

export type TabSettledMethod = "cash" | "card" | "comp" | "other";

export interface Tab {
  id: string;
  businessId: string;
  tableId?: string;
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
  currentQuantity: number; // ml for bottle/keg; count for 'each'
  parQuantity?: number;
  costPerUnit?: number;
  notes?: string;
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
  movementType: "receive" | "adjust" | "waste" | "sale"; // 'sale' = auto recipe deduction
  quantityDelta: number;
  reason?: WasteReason; // structured cause on waste movements
  notes?: string;
  createdBy?: string;
  alertTriggered: boolean;
  createdAt: string;
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

export interface Reservation {
  id: string;
  businessId: string;
  customerId: string;
  serviceTypeId: string;
  time: string;
  phone: string;
  email: string;
  note?: string;
  status: "confirmed" | "pending" | "cancelled" | "completed";
  guests: number;
  createdAt: string;
  updatedAt: string;
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