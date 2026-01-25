export * from "@/types";
export { mockVenues } from "./venues";
export { mockTables } from "./tables";
export { mockCustomers } from "./customers";
export { mockStaff } from "./staff";
export { mockAuth } from "./auth";
export { mockReservations } from "./reservations";
export { mockReservationTypes, defaultReservationTypeIds } from "./reservation-types";

// Helper functions to get data by ID
import { Reservation } from "@/types";
import { mockVenues } from "./venues";
import { mockTables } from "./tables";
import { mockCustomers } from "./customers";
import { mockStaff } from "./staff";
import { mockReservations } from "./reservations";
import { mockReservationTypes, defaultReservationTypeIds } from "./reservation-types";

export const getVenueById = (id: string) =>
  mockVenues.find((venue) => venue.id === id);
export const getVenueBySlug = (slug: string) =>
  mockVenues.find((venue) => venue.slug === slug);
export const getTableById = (id: string) =>
  mockTables.find((table) => table.id === id);
export const getCustomerById = (id: string) =>
  mockCustomers.find((customer) => customer.id === customer.id);
export const getStaffById = (id: string) =>
  mockStaff.find((staff) => staff.id === id);
export const getReservationsByVenueId = (venueId: string) =>
  mockReservations.filter((res) => res.venueId === venueId);
export const getReservationsByCustomerId = (customerId: string) =>
  mockReservations.filter((res) => res.customerId === customerId);
export const getTablesByVenueId = (venueId: string) =>
  mockTables.filter((table) => table.venueId === venueId);

export const getStaffByVenueId = (venueId: string) =>
  mockStaff.filter((staff) => staff.venueId === venueId);

export const getVenueByStaffId = (staffId: string) => {
  const staff = getStaffById(staffId);
  return staff ? getVenueById(staff.venueId) : null;
};

// Reservation Type helper functions
export const getReservationTypesByVenueId = (venueId: string) =>
  mockReservationTypes.filter((type) => type.venueId === venueId);

export const getReservationTypeById = (id: string) =>
  mockReservationTypes.find((type) => type.id === id);

export const getReservationTypeByReservation = (reservation: Reservation) => {
  if (!reservation.reservationTypeId) {
    // Return default type for venue if no type specified
    const defaultTypeId = defaultReservationTypeIds[reservation.venueId];
    return defaultTypeId ? getReservationTypeById(defaultTypeId) : null;
  }
  return getReservationTypeById(reservation.reservationTypeId);
};

export const getDefaultReservationTypeId = (venueId: string) =>
  defaultReservationTypeIds[venueId];

// Get all unique people who have reservations for a venue
export const getPeopleByVenueId = (venueId: string) => {
  const reservations = getReservationsByVenueId(venueId);
  const peopleMap = new Map<
    string,
    {
      email: string;
      phone: string;
      name: string;
      reservations: Reservation[];
    }
  >();

  reservations.forEach((reservation) => {
    const key = reservation.email.toLowerCase();
    if (!peopleMap.has(key)) {
      const customer = getCustomerById(reservation.customerId);
      peopleMap.set(key, {
        email: reservation.email,
        phone: reservation.phone,
        name: customer?.name || reservation.email.split("@")[0],
        reservations: [],
      });
    }
    peopleMap.get(key)!.reservations.push(reservation);
  });

  return Array.from(peopleMap.values());
};

// Dashboard helper functions
export const getVenueDashboardStats = (venueId: string) => {
  const reservations = getReservationsByVenueId(venueId);
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // Today's reservations
  const todayReservations = reservations.filter(
    (r) => r.time.split("T")[0] === today && r.status !== "cancelled"
  );

  // Pending requests
  const pendingRequests = reservations.filter((r) => r.status === "pending");

  // Today's guest count
  const todayGuestCount = todayReservations.reduce((sum, r) => sum + r.guests, 0);

  // Status breakdown for last 7 days
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last7DaysReservations = reservations.filter(
    (r) => new Date(r.time) >= sevenDaysAgo
  );
  const statusBreakdown = {
    confirmed: last7DaysReservations.filter((r) => r.status === "confirmed").length,
    pending: last7DaysReservations.filter((r) => r.status === "pending").length,
    cancelled: last7DaysReservations.filter((r) => r.status === "cancelled").length,
    completed: last7DaysReservations.filter((r) => r.status === "completed").length,
  };

  // Reservations by type for last 7 days
  const reservationTypes = getReservationTypesByVenueId(venueId);
  const reservationsByType = reservationTypes.map((type) => ({
    name: type.name,
    color: type.color,
    count: last7DaysReservations.filter(
      (r) => r.reservationTypeId === type.id || 
      (!r.reservationTypeId && type.id === getDefaultReservationTypeId(venueId))
    ).length,
  }));

  // Daily breakdown by type for last 7 days (for stacked column chart)
  const dailyByType: Array<{ day: string; [key: string]: string | number }> = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split("T")[0];
    const dayLabel = date.toLocaleDateString("en-US", { weekday: "short" });
    
    const dayData: { day: string; [key: string]: string | number } = { day: dayLabel };
    reservationTypes.forEach((type) => {
      const typeKey = type.name.replace(/\s+/g, "");
      dayData[typeKey] = last7DaysReservations.filter(
        (r) =>
          r.time.split("T")[0] === dateStr &&
          (r.reservationTypeId === type.id ||
            (!r.reservationTypeId && type.id === getDefaultReservationTypeId(venueId)))
      ).length;
    });
    dailyByType.push(dayData);
  }

  // Upcoming reservations (sorted by time, limit 5)
  const upcomingReservations = reservations
    .filter((r) => new Date(r.time) >= now && r.status !== "cancelled")
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .slice(0, 5);

  // Last month comparison (simplified)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const thisMonthCount = reservations.filter(
    (r) => new Date(r.time) >= thirtyDaysAgo && r.status !== "cancelled"
  ).length;
  const lastMonthCount = reservations.filter(
    (r) =>
      new Date(r.time) >= sixtyDaysAgo &&
      new Date(r.time) < thirtyDaysAgo &&
      r.status !== "cancelled"
  ).length;
  const monthChange =
    lastMonthCount === 0
      ? 100
      : Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100);

  return {
    todayReservations: todayReservations.length,
    pendingRequests: pendingRequests.length,
    todayGuestCount,
    statusBreakdown,
    reservationsByType,
    dailyByType,
    upcomingReservations,
    monthChange,
  };
};

export const getCustomerDashboardStats = (customerId: string) => {
  const reservations = getReservationsByCustomerId(customerId);
  const now = new Date();

  // Status breakdown
  const statusBreakdown = {
    confirmed: reservations.filter((r) => r.status === "confirmed").length,
    pending: reservations.filter((r) => r.status === "pending").length,
    cancelled: reservations.filter((r) => r.status === "cancelled").length,
    completed: reservations.filter((r) => r.status === "completed").length,
  };

  // Upcoming reservations (sorted by time, limit 3)
  const upcomingReservations = reservations
    .filter((r) => new Date(r.time) >= now && r.status !== "cancelled")
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .slice(0, 3);

  return {
    totalReservations: reservations.length,
    statusBreakdown,
    upcomingReservations,
  };
};