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
  venueId: string;
  role: "owner" | "manager" | "staff";
}

// Auth
export interface AuthInfo {
  userId: string;
  email: string;
  password: string; // In real app, this would be hashed
  type: "customer" | "staff";
}

// Venue: Bar, Restaurant, Club, etc.
export interface Venue {
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
}

// Table
export interface Table {
  id: string;
  venueId: string;
  number: string; // e.g., "Table 1", "T-5"
  capacity: number;
  status: "available" | "occupied" | "reserved";
}

// Reservation Type
export interface ReservationType {
  id: string;
  venueId: string;
  name: string; // e.g., "Standard Table", "VIP Table", "Private Room"
  description?: string;
  requiresPayment: boolean;
  amount?: number; // null if no payment required
  color: string; // Hex color code (e.g., "#3b82f6")
  maxGuests?: number; // Optional capacity limit for this type
  createdAt: string;
  updatedAt: string;
}

// Reservation
export interface Reservation {
  id: string;
  venueId: string;
  customerId: string;
  tableId: string;
  reservationTypeId?: string; // Reference to ReservationType
  time: string; // ISO date string
  phone: string;
  email: string;
  note?: string;
  status: "confirmed" | "pending" | "cancelled" | "completed";
  guests: number;
  paymentAmount?: number; // Store actual paid amount
  paymentStatus?: "pending" | "paid" | "refunded";
  stripePaymentIntentId?: string; // Link to Stripe payment
  createdAt: string;
  updatedAt: string;
}