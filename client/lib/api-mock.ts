/**
 * Mock API layer — drop-in replacement for api.ts when backend is unavailable.
 *
 * Activated by setting NEXT_PUBLIC_USE_MOCK_API=true.
 * Returns static mock data; authenticated endpoints return null (no user session).
 */

import { Business, ServiceType, Reservation } from "@/types";
import type {
  UserResponse,
  StaffResponse,
  BusinessDashboardStats,
  CustomerDashboardStats,
  LoginResponse,
} from "./api-client";
import {
  mockBusinesses,
  mockServiceTypes,
  mockReservations,
  mockCustomers,
  mockStaff,
  getMockBusinessDashboardStats,
  getMockCustomerDashboardStats,
} from "./mock-data";

// ─── Token helpers (no-op in mock mode) ─────────────────────────────────────

export async function getToken(): Promise<string | null> {
  return null;
}

export async function setTokenCookie(): Promise<void> {
  // no-op
}

export async function deleteTokenCookie(): Promise<void> {
  // no-op
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export type { LoginResponse };

export async function serverLogin(): Promise<LoginResponse> {
  // Mock mode: return a fake token
  return {
    access_token: "mock-token",
    token_type: "bearer",
    user_id: "00000000-0000-0000-0001-000000000001",
    user_type: "customer",
  };
}

export async function serverGetMe(): Promise<UserResponse | null> {
  // No session in mock mode
  return null;
}

// ─── Businesses ─────────────────────────────────────────────────────────────

export async function fetchBusinesses(): Promise<Business[]> {
  return mockBusinesses;
}

export async function fetchBusiness(id: string): Promise<Business | null> {
  return mockBusinesses.find((b) => b.id === id) ?? null;
}

export async function fetchBusinessBySlug(slug: string): Promise<Business | null> {
  return mockBusinesses.find((b) => b.slug === slug) ?? null;
}

// ─── Service Types ──────────────────────────────────────────────────────────

export async function fetchServiceTypesByBusiness(
  businessId: string
): Promise<ServiceType[]> {
  return mockServiceTypes.filter((st) => st.businessId === businessId);
}

export async function fetchServiceType(id: string): Promise<ServiceType | null> {
  return mockServiceTypes.find((st) => st.id === id) ?? null;
}

// ─── Reservations ───────────────────────────────────────────────────────────

export async function fetchBusinessReservations(
  businessId: string,
  status?: string
): Promise<Reservation[]> {
  let results = mockReservations.filter((r) => r.businessId === businessId);
  if (status) {
    results = results.filter((r) => r.status === status);
  }
  return results;
}

export async function fetchCustomerReservations(
  customerId: string
): Promise<Reservation[]> {
  return mockReservations.filter((r) => r.customerId === customerId);
}

export async function fetchMyReservations(): Promise<Reservation[]> {
  // No session in mock mode — return empty
  return [];
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export async function fetchBusinessDashboardStats(
  businessId: string
): Promise<BusinessDashboardStats | null> {
  return getMockBusinessDashboardStats(businessId);
}

export async function fetchMyCustomerStats(): Promise<CustomerDashboardStats | null> {
  return getMockCustomerDashboardStats("00000000-0000-0000-0001-000000000001");
}

// ─── Customers ──────────────────────────────────────────────────────────────

export async function fetchBusinessCustomers(
  _businessId: string
): Promise<UserResponse[]> {
  return mockCustomers;
}

export async function fetchCustomer(
  customerId: string
): Promise<UserResponse | null> {
  return mockCustomers.find((c) => c.id === customerId) ?? null;
}

// ─── Staff ──────────────────────────────────────────────────────────────────

export async function fetchBusinessStaff(
  _businessId: string
): Promise<StaffResponse[]> {
  return mockStaff;
}
