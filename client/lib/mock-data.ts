/**
 * Mock data for the frontend when the backend is not available.
 *
 * Based on the seed data in server/db/seeds/.
 * Used when NEXT_PUBLIC_USE_MOCK_API=true (e.g. on Vercel before backend is deployed).
 */

import { Business, ServiceType, Reservation } from "@/types";
import type { UserResponse, StaffResponse, BusinessDashboardStats, CustomerDashboardStats } from "./api-client";

// ─── Helper: relative dates so data always looks fresh ──────────────────────

function daysFromNow(days: number, hour: number = 10, minute: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// ─── Businesses ─────────────────────────────────────────────────────────────

export const mockBusinesses: Business[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "The Rustic Table",
    slug: "the-rustic-table",
    email: "info@rustictable.com",
    phone: "+1-555-0101",
    address: "123 Main Street, Downtown, State 12345",
    description: "Cozy restaurant and bar with a warm atmosphere, perfect for dinner and drinks",
    image: "/business-bar.jpg",
    website: "https://rustictable.com",
    tags: ["Restaurant", "Bar", "Dinner", "Drinks", "Casual Dining"],
    maxGuests: 20,
    reservationTime: 90,
    timeSlotInterval: 15,
    advanceBookingDays: 30,
    operatingHours: {
      monday: { open: "11:00", close: "23:00" },
      tuesday: { open: "11:00", close: "23:00" },
      wednesday: { open: "11:00", close: "23:00" },
      thursday: { open: "11:00", close: "23:00" },
      friday: { open: "11:00", close: "00:00" },
      saturday: { open: "11:00", close: "00:00" },
      sunday: { open: "11:00", close: "22:00" },
    },
    createdAt: "2024-01-15T10:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Grand Event Hall",
    slug: "grand-event-hall",
    email: "events@grandhall.com",
    phone: "+1-555-0201",
    address: "456 Event Boulevard, City, State 12345",
    description: "Spacious event venue perfect for parties, corporate events, and celebrations. Accommodates up to 50 guests with full catering and AV support.",
    image: "/business-venue.jpg",
    website: "https://grandhall.com",
    tags: ["Event Space", "Party Venue", "Corporate Events", "Weddings"],
    maxGuests: 50,
    reservationTime: 240,
    timeSlotInterval: 60,
    advanceBookingDays: 180,
    operatingHours: {
      monday: { open: "10:00", close: "02:00" },
      tuesday: { open: "10:00", close: "02:00" },
      wednesday: { open: "10:00", close: "02:00" },
      thursday: { open: "10:00", close: "02:00" },
      friday: { open: "10:00", close: "02:00" },
      saturday: { open: "10:00", close: "02:00" },
      sunday: { open: "10:00", close: "02:00" },
    },
    createdAt: "2024-01-20T10:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    name: "Strategic Consulting",
    slug: "strategic-consulting",
    email: "consult@strategic.com",
    phone: "+1-555-0301",
    address: "789 Business Plaza, Suite 200, City, State 12345",
    description: "Professional business consulting services. Expert advice on strategy, financial planning, and business development.",
    image: "/business-consulting.jpg",
    website: "https://strategicconsulting.com",
    tags: ["Consulting", "Business Strategy", "Financial Planning", "Professional Services"],
    maxGuests: 3,
    reservationTime: 90,
    timeSlotInterval: 30,
    advanceBookingDays: 60,
    operatingHours: {
      monday: { open: "09:00", close: "17:00" },
      tuesday: { open: "09:00", close: "17:00" },
      wednesday: { open: "09:00", close: "17:00" },
      thursday: { open: "09:00", close: "17:00" },
      friday: { open: "09:00", close: "17:00" },
      saturday: { closed: true },
      sunday: { closed: true },
    },
    createdAt: "2024-01-25T10:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    name: "Wellness Therapy Center",
    slug: "wellness-therapy",
    email: "therapy@wellness.com",
    phone: "+1-555-0401",
    address: "321 Wellness Way, Suite 100, City, State 12345",
    description: "Professional therapy services for individuals and couples. Safe, comfortable environment for personal growth and healing.",
    image: "/business-therapy.jpg",
    website: "https://wellnesstherapy.com",
    tags: ["Therapy", "Mental Health", "Individual Therapy", "Couples Therapy"],
    maxGuests: 2,
    reservationTime: 90,
    timeSlotInterval: 15,
    advanceBookingDays: 90,
    operatingHours: {
      monday: { open: "08:00", close: "20:00" },
      tuesday: { open: "08:00", close: "20:00" },
      wednesday: { open: "08:00", close: "20:00" },
      thursday: { open: "08:00", close: "20:00" },
      friday: { open: "08:00", close: "20:00" },
      saturday: { open: "09:00", close: "16:00" },
      sunday: { open: "10:00", close: "14:00" },
    },
    createdAt: "2024-01-30T10:00:00Z",
  },
];

// ─── Service Types ──────────────────────────────────────────────────────────

export const mockServiceTypes: ServiceType[] = [
  // The Rustic Table
  {
    id: "00000000-0000-0000-0004-000000000001",
    businessId: "00000000-0000-0000-0000-000000000001",
    name: "Table (4-person)",
    description: "Spacious table for up to 4 guests",
    capacity: 4,
    requiresPayment: false,
    isOnline: false,
    isPendingEnabled: true,
    color: "#3b82f6",
    displayOrder: 1,
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-15T10:00:00Z",
  },
  {
    id: "00000000-0000-0000-0004-000000000002",
    businessId: "00000000-0000-0000-0000-000000000001",
    name: "Table (2-person)",
    description: "Intimate table for 2 guests",
    capacity: 2,
    requiresPayment: false,
    isOnline: false,
    isPendingEnabled: true,
    color: "#3b82f6",
    displayOrder: 2,
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-15T10:00:00Z",
  },
  {
    id: "00000000-0000-0000-0004-000000000003",
    businessId: "00000000-0000-0000-0000-000000000001",
    name: "Bar Seat (1-person)",
    description: "Single seat at the bar",
    capacity: 1,
    requiresPayment: false,
    isOnline: false,
    isPendingEnabled: true,
    color: "#8b5cf6",
    displayOrder: 3,
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-15T10:00:00Z",
  },
  {
    id: "00000000-0000-0000-0004-000000000004",
    businessId: "00000000-0000-0000-0000-000000000001",
    name: "Bar Seat (2-person)",
    description: "Two seats together at the bar",
    capacity: 2,
    requiresPayment: false,
    isOnline: false,
    isPendingEnabled: true,
    color: "#8b5cf6",
    displayOrder: 4,
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-15T10:00:00Z",
  },
  // Grand Event Hall
  {
    id: "00000000-0000-0000-0004-000000000005",
    businessId: "00000000-0000-0000-0000-000000000002",
    name: "Main Hall",
    description: "Large event space accommodating up to 50 guests",
    capacity: 50,
    requiresPayment: true,
    isOnline: false,
    isPendingEnabled: true,
    amount: 500.0,
    color: "#10b981",
    displayOrder: 1,
    createdAt: "2024-01-20T10:00:00Z",
    updatedAt: "2024-01-20T10:00:00Z",
  },
  // Strategic Consulting
  {
    id: "00000000-0000-0000-0004-000000000006",
    businessId: "00000000-0000-0000-0000-000000000003",
    name: "30-min Consultation",
    description: "Quick consultation session",
    capacity: 3,
    maxConcurrentBookings: 5,
    requiresPayment: true,
    isOnline: false,
    isPendingEnabled: true,
    amount: 75.0,
    duration: 30,
    color: "#f59e0b",
    displayOrder: 1,
    createdAt: "2024-01-25T10:00:00Z",
    updatedAt: "2024-01-25T10:00:00Z",
  },
  {
    id: "00000000-0000-0000-0004-000000000007",
    businessId: "00000000-0000-0000-0000-000000000003",
    name: "60-min Consultation",
    description: "Standard consultation session",
    capacity: 3,
    maxConcurrentBookings: 3,
    requiresPayment: true,
    isOnline: false,
    isPendingEnabled: true,
    amount: 150.0,
    duration: 60,
    color: "#f59e0b",
    displayOrder: 2,
    createdAt: "2024-01-25T10:00:00Z",
    updatedAt: "2024-01-25T10:00:00Z",
  },
  {
    id: "00000000-0000-0000-0004-000000000008",
    businessId: "00000000-0000-0000-0000-000000000003",
    name: "90-min Consultation",
    description: "Extended consultation session",
    capacity: 3,
    maxConcurrentBookings: 2,
    requiresPayment: true,
    isOnline: false,
    isPendingEnabled: true,
    amount: 200.0,
    duration: 90,
    color: "#f59e0b",
    displayOrder: 3,
    createdAt: "2024-01-25T10:00:00Z",
    updatedAt: "2024-01-25T10:00:00Z",
  },
  // Wellness Therapy Center
  {
    id: "00000000-0000-0000-0004-000000000009",
    businessId: "00000000-0000-0000-0000-000000000004",
    name: "Individual Therapy",
    description: "One-on-one therapy session",
    capacity: 1,
    requiresPayment: true,
    isOnline: false,
    isPendingEnabled: true,
    amount: 120.0,
    duration: 60,
    color: "#06b6d4",
    displayOrder: 1,
    createdAt: "2024-01-30T10:00:00Z",
    updatedAt: "2024-01-30T10:00:00Z",
  },
  {
    id: "00000000-0000-0000-0004-000000000010",
    businessId: "00000000-0000-0000-0000-000000000004",
    name: "Couples Therapy",
    description: "Therapy session for couples",
    capacity: 2,
    requiresPayment: true,
    isOnline: false,
    isPendingEnabled: true,
    amount: 180.0,
    duration: 90,
    color: "#a855f7",
    displayOrder: 2,
    createdAt: "2024-01-30T10:00:00Z",
    updatedAt: "2024-01-30T10:00:00Z",
  },
];

// ─── Users ──────────────────────────────────────────────────────────────────

export const mockCustomers: UserResponse[] = [
  {
    id: "00000000-0000-0000-0001-000000000001",
    email: "john.doe@example.com",
    name: "John Doe",
    phone: "+1-555-1001",
    avatar: null,
    user_type: "customer",
    created_at: "2024-02-01T10:00:00Z",
  },
  {
    id: "00000000-0000-0000-0001-000000000002",
    email: "jane.smith@example.com",
    name: "Jane Smith",
    phone: "+1-555-1002",
    avatar: null,
    user_type: "customer",
    created_at: "2024-02-05T10:00:00Z",
  },
  {
    id: "00000000-0000-0000-0001-000000000003",
    email: "mike.johnson@example.com",
    name: "Mike Johnson",
    phone: "+1-555-1003",
    avatar: null,
    user_type: "customer",
    created_at: "2024-02-10T10:00:00Z",
  },
  {
    id: "00000000-0000-0000-0001-000000000004",
    email: "sarah.williams@example.com",
    name: "Sarah Williams",
    phone: "+1-555-1004",
    avatar: null,
    user_type: "customer",
    created_at: "2024-02-15T10:00:00Z",
  },
  {
    id: "00000000-0000-0000-0001-000000000005",
    email: "david.brown@example.com",
    name: "David Brown",
    phone: "+1-555-1005",
    avatar: null,
    user_type: "customer",
    created_at: "2024-02-20T10:00:00Z",
  },
];

export const mockStaffUsers: UserResponse[] = [
  {
    id: "00000000-0000-0000-0002-000000000001",
    email: "owner@rustictable.com",
    name: "Maria Rodriguez",
    phone: "+1-555-2001",
    avatar: null,
    user_type: "staff",
    business_id: "00000000-0000-0000-0000-000000000001",
    role: "owner",
    created_at: "2024-01-15T10:00:00Z",
  },
  {
    id: "00000000-0000-0000-0002-000000000002",
    email: "manager@rustictable.com",
    name: "James Wilson",
    phone: "+1-555-2002",
    avatar: null,
    user_type: "staff",
    business_id: "00000000-0000-0000-0000-000000000001",
    role: "manager",
    created_at: "2024-01-16T10:00:00Z",
  },
];

// ─── Staff Assignments ──────────────────────────────────────────────────────

export const mockStaff: StaffResponse[] = [
  {
    id: "00000000-0000-0000-0003-000000000001",
    user_id: "00000000-0000-0000-0002-000000000001",
    business_id: "00000000-0000-0000-0000-000000000001",
    role: "owner",
    created_at: "2024-01-15T10:00:00Z",
    user_name: "Maria Rodriguez",
    user_email: "owner@rustictable.com",
    user_phone: "+1-555-2001",
  },
  {
    id: "00000000-0000-0000-0003-000000000002",
    user_id: "00000000-0000-0000-0002-000000000002",
    business_id: "00000000-0000-0000-0000-000000000001",
    role: "manager",
    created_at: "2024-01-16T10:00:00Z",
    user_name: "James Wilson",
    user_email: "manager@rustictable.com",
    user_phone: "+1-555-2002",
  },
  {
    id: "00000000-0000-0000-0003-000000000003",
    user_id: "00000000-0000-0000-0002-000000000003",
    business_id: "00000000-0000-0000-0000-000000000001",
    role: "staff",
    created_at: "2024-01-17T10:00:00Z",
    user_name: "Emily Chen",
    user_email: "staff@rustictable.com",
    user_phone: "+1-555-2003",
  },
];

// ─── Reservations (with relative dates) ─────────────────────────────────────

export const mockReservations: Reservation[] = [
  // Yesterday — completed / cancelled
  {
    id: "00000000-0000-0000-0005-000000000001",
    businessId: "00000000-0000-0000-0000-000000000001",
    customerId: "00000000-0000-0000-0001-000000000001",
    serviceTypeId: "00000000-0000-0000-0004-000000000001",
    time: daysFromNow(-1, 19, 0),
    phone: "+1-555-1001",
    email: "john.doe@example.com",
    note: "Window seat preferred",
    status: "completed",
    guests: 4,
    createdAt: daysFromNow(-8, 10),
    updatedAt: daysFromNow(-1, 21),
  },
  {
    id: "00000000-0000-0000-0005-000000000002",
    businessId: "00000000-0000-0000-0000-000000000001",
    customerId: "00000000-0000-0000-0001-000000000002",
    serviceTypeId: "00000000-0000-0000-0004-000000000002",
    time: daysFromNow(-1, 20, 0),
    phone: "+1-555-1002",
    email: "jane.smith@example.com",
    note: "Anniversary dinner",
    status: "completed",
    guests: 2,
    createdAt: daysFromNow(-7, 10),
    updatedAt: daysFromNow(-1, 22),
  },
  {
    id: "00000000-0000-0000-0005-000000000003",
    businessId: "00000000-0000-0000-0000-000000000001",
    customerId: "00000000-0000-0000-0001-000000000003",
    serviceTypeId: "00000000-0000-0000-0004-000000000003",
    time: daysFromNow(-1, 18, 30),
    phone: "+1-555-1003",
    email: "mike.johnson@example.com",
    status: "cancelled",
    guests: 1,
    createdAt: daysFromNow(-6, 10),
    updatedAt: daysFromNow(-2, 10),
  },
  // Today — confirmed
  {
    id: "00000000-0000-0000-0005-000000000006",
    businessId: "00000000-0000-0000-0000-000000000001",
    customerId: "00000000-0000-0000-0001-000000000004",
    serviceTypeId: "00000000-0000-0000-0004-000000000001",
    time: daysFromNow(0, 18, 0),
    phone: "+1-555-1004",
    email: "sarah.williams@example.com",
    note: "Early dinner",
    status: "confirmed",
    guests: 3,
    createdAt: daysFromNow(-5, 10),
    updatedAt: daysFromNow(-5, 10),
  },
  {
    id: "00000000-0000-0000-0005-000000000007",
    businessId: "00000000-0000-0000-0000-000000000001",
    customerId: "00000000-0000-0000-0001-000000000005",
    serviceTypeId: "00000000-0000-0000-0004-000000000002",
    time: daysFromNow(0, 19, 30),
    phone: "+1-555-1005",
    email: "david.brown@example.com",
    status: "confirmed",
    guests: 2,
    createdAt: daysFromNow(-4, 10),
    updatedAt: daysFromNow(-4, 10),
  },
  {
    id: "00000000-0000-0000-0005-000000000008",
    businessId: "00000000-0000-0000-0000-000000000003",
    customerId: "00000000-0000-0000-0001-000000000004",
    serviceTypeId: "00000000-0000-0000-0004-000000000007",
    time: daysFromNow(0, 14, 0),
    phone: "+1-555-1004",
    email: "sarah.williams@example.com",
    note: "Financial planning session",
    status: "confirmed",
    guests: 1,
    paymentAmount: 150.0,
    paymentStatus: "paid",
    createdAt: daysFromNow(-6, 10),
    updatedAt: daysFromNow(-6, 10),
  },
  {
    id: "00000000-0000-0000-0005-000000000009",
    businessId: "00000000-0000-0000-0000-000000000004",
    customerId: "00000000-0000-0000-0001-000000000001",
    serviceTypeId: "00000000-0000-0000-0004-000000000009",
    time: daysFromNow(0, 10, 0),
    phone: "+1-555-1001",
    email: "john.doe@example.com",
    status: "confirmed",
    guests: 1,
    paymentAmount: 120.0,
    paymentStatus: "paid",
    createdAt: daysFromNow(-5, 10),
    updatedAt: daysFromNow(-5, 10),
  },
  // Tomorrow — mix of confirmed and pending
  {
    id: "00000000-0000-0000-0005-000000000011",
    businessId: "00000000-0000-0000-0000-000000000001",
    customerId: "00000000-0000-0000-0001-000000000001",
    serviceTypeId: "00000000-0000-0000-0004-000000000004",
    time: daysFromNow(1, 19, 30),
    phone: "+1-555-1001",
    email: "john.doe@example.com",
    status: "confirmed",
    guests: 2,
    createdAt: daysFromNow(-3, 10),
    updatedAt: daysFromNow(-3, 10),
  },
  {
    id: "00000000-0000-0000-0005-000000000012",
    businessId: "00000000-0000-0000-0000-000000000002",
    customerId: "00000000-0000-0000-0001-000000000002",
    serviceTypeId: "00000000-0000-0000-0004-000000000005",
    time: daysFromNow(1, 19, 0),
    phone: "+1-555-1002",
    email: "jane.smith@example.com",
    note: "Corporate team building event",
    status: "pending",
    guests: 45,
    createdAt: daysFromNow(-2, 10),
    updatedAt: daysFromNow(-2, 10),
  },
  {
    id: "00000000-0000-0000-0005-000000000013",
    businessId: "00000000-0000-0000-0000-000000000003",
    customerId: "00000000-0000-0000-0001-000000000005",
    serviceTypeId: "00000000-0000-0000-0004-000000000008",
    time: daysFromNow(1, 11, 0),
    phone: "+1-555-1005",
    email: "david.brown@example.com",
    status: "pending",
    guests: 3,
    createdAt: daysFromNow(-1, 10),
    updatedAt: daysFromNow(-1, 10),
  },
  {
    id: "00000000-0000-0000-0005-000000000014",
    businessId: "00000000-0000-0000-0000-000000000004",
    customerId: "00000000-0000-0000-0001-000000000003",
    serviceTypeId: "00000000-0000-0000-0004-000000000009",
    time: daysFromNow(1, 11, 0),
    phone: "+1-555-1003",
    email: "mike.johnson@example.com",
    status: "pending",
    guests: 1,
    createdAt: daysFromNow(0, 8),
    updatedAt: daysFromNow(0, 8),
  },
  // Day after tomorrow
  {
    id: "00000000-0000-0000-0005-000000000015",
    businessId: "00000000-0000-0000-0000-000000000001",
    customerId: "00000000-0000-0000-0001-000000000005",
    serviceTypeId: "00000000-0000-0000-0004-000000000001",
    time: daysFromNow(2, 18, 0),
    phone: "+1-555-1005",
    email: "david.brown@example.com",
    note: "Early dinner reservation",
    status: "confirmed",
    guests: 3,
    createdAt: daysFromNow(-2, 10),
    updatedAt: daysFromNow(-2, 10),
  },
  // 3 days from now
  {
    id: "00000000-0000-0000-0005-000000000018",
    businessId: "00000000-0000-0000-0000-000000000001",
    customerId: "00000000-0000-0000-0001-000000000002",
    serviceTypeId: "00000000-0000-0000-0004-000000000002",
    time: daysFromNow(3, 19, 0),
    phone: "+1-555-1002",
    email: "jane.smith@example.com",
    note: "Weekend dinner",
    status: "confirmed",
    guests: 4,
    createdAt: daysFromNow(-1, 10),
    updatedAt: daysFromNow(-1, 10),
  },
  {
    id: "00000000-0000-0000-0005-000000000019",
    businessId: "00000000-0000-0000-0000-000000000001",
    customerId: "00000000-0000-0000-0001-000000000003",
    serviceTypeId: "00000000-0000-0000-0004-000000000003",
    time: daysFromNow(3, 20, 30),
    phone: "+1-555-1003",
    email: "mike.johnson@example.com",
    status: "pending",
    guests: 2,
    createdAt: daysFromNow(0, 10),
    updatedAt: daysFromNow(0, 10),
  },
];

// ─── Dashboard Stats ────────────────────────────────────────────────────────

export function getMockBusinessDashboardStats(businessId: string): BusinessDashboardStats {
  const businessReservations = mockReservations.filter((r) => r.businessId === businessId);
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayReservations = businessReservations.filter((r) => r.time.slice(0, 10) === todayStr);
  const pendingReservations = businessReservations.filter((r) => r.status === "pending");

  const serviceTypes = mockServiceTypes.filter((st) => st.businessId === businessId);

  return {
    today_reservations: todayReservations.length,
    pending_requests: pendingReservations.length,
    today_guest_count: todayReservations.reduce((sum, r) => sum + r.guests, 0),
    status_breakdown: {
      confirmed: businessReservations.filter((r) => r.status === "confirmed").length,
      pending: pendingReservations.length,
      cancelled: businessReservations.filter((r) => r.status === "cancelled").length,
      completed: businessReservations.filter((r) => r.status === "completed").length,
    },
    reservations_by_type: serviceTypes.map((st) => ({
      name: st.name,
      color: st.color,
      count: businessReservations.filter((r) => r.serviceTypeId === st.id).length,
    })),
    daily_by_type: (() => {
      const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // Get last 7 days of reservations
      const last7DaysReservations = businessReservations.filter(
        (r) => new Date(r.time) >= sevenDaysAgo && r.status !== "cancelled"
      );
      
      // Group by day of week
      const dailyData = [];
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const dayStart = new Date(sevenDaysAgo);
        dayStart.setDate(dayStart.getDate() + dayOffset);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        
        const dayOfWeek = dayStart.getDay(); // 0 = Sunday, 6 = Saturday
        // Convert to Monday = 0 format
        const dayIndex = (dayOfWeek + 6) % 7; // Monday = 0, Sunday = 6
        const dayName = dayNames[dayIndex];
        
        const dayReservations = last7DaysReservations.filter(
          (r) => {
            const rDate = new Date(r.time);
            return rDate >= dayStart && rDate < dayEnd;
          }
        );
        
        const dayData: Record<string, string | number> = { day: dayName };
        serviceTypes.forEach((st) => {
          dayData[st.name] = dayReservations.filter((r) => r.serviceTypeId === st.id).length;
        });
        
        dailyData.push(
          dayData as BusinessDashboardStats["daily_by_type"][number],
        );
      }

      return dailyData;
    })(),
    upcoming_reservations: businessReservations
      .filter((r) => r.status === "confirmed" && new Date(r.time) >= new Date())
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        time: r.time,
        guests: r.guests,
        status: r.status,
        service_type_id: r.serviceTypeId,
        customer_id: r.customerId,
      })),
    month_change: 12.5,
  };
}

export function getMockCustomerDashboardStats(customerId: string): CustomerDashboardStats {
  const customerReservations = mockReservations.filter((r) => r.customerId === customerId);

  return {
    total_reservations: customerReservations.length,
    status_breakdown: {
      confirmed: customerReservations.filter((r) => r.status === "confirmed").length,
      pending: customerReservations.filter((r) => r.status === "pending").length,
      cancelled: customerReservations.filter((r) => r.status === "cancelled").length,
      completed: customerReservations.filter((r) => r.status === "completed").length,
    },
    upcoming_reservations: customerReservations
      .filter((r) => r.status === "confirmed" && new Date(r.time) >= new Date())
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        time: r.time,
        guests: r.guests,
        status: r.status,
        business_id: r.businessId,
        service_type_id: r.serviceTypeId,
      })),
  };
}
