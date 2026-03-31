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

// Form field definition for customizable reservation forms
export interface FormFieldDefinition {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "email" | "phone" | "date" | "time" | "select" | "checkbox";
  required: boolean;
  placeholder?: string;
  options?: string[]; // for select type
  min?: number; // for number type
  max?: number; // for number type
  maxLength?: number; // for text/textarea
  order: number;
  system: boolean; // true for system fields (date, time, email, phone, guests)
}

// Service Type - unified concept for bookable services/spaces
export interface ServiceType {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  capacity: number;
  maxConcurrentBookings?: number;
  requiresPayment: boolean;
  amount?: number;
  isOnline: boolean;
  isPendingEnabled: boolean;
  duration?: number;
  color: string;
  displayOrder?: number;
  image?: string;
  formFields?: FormFieldDefinition[];
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
  categories: MenuCategory[];
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
  notes?: string;
}

export interface OrderStatusEvent {
  id: string;
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

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  businessId: string;
  locationId?: string;
  name: string;
  unit: string;
  currentQuantity: number;
  parQuantity?: number;
  costPerUnit?: number;
  notes?: string;
  isLowStock: boolean; // computed in mapper: parQuantity != null && currentQuantity < parQuantity
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  businessId: string;
  locationId?: string;
  itemId: string;
  movementType: "receive" | "adjust" | "waste";
  quantityDelta: number;
  notes?: string;
  createdBy?: string;
  alertTriggered: boolean;
  createdAt: string;
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
  paymentAmount?: number;
  paymentStatus?: "pending" | "paid" | "refunded";
  stripePaymentIntentId?: string;
  meetingLink?: string;
  customFields?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}