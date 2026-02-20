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
  role: "staff_admin" | "staff";
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
  duration?: number;
  color: string;
  displayOrder?: number;
  image?: string;
  formFields?: FormFieldDefinition[];
  createdAt: string;
  updatedAt: string;
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
  customFields?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}