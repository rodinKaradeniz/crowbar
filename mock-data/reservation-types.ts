import { ReservationType } from "@/types";

export const mockReservationTypes: ReservationType[] = [
  // The Iron Horse (venueId: "1")
  {
    id: "type-1-1",
    venueId: "1",
    name: "Standard Table",
    description: "Regular table reservation",
    requiresPayment: false,
    color: "#3b82f6", // Blue
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-15T10:00:00Z",
  },
  {
    id: "type-1-2",
    venueId: "1",
    name: "VIP Table",
    description: "Premium seating with priority service",
    requiresPayment: true,
    amount: 25.0,
    color: "#10b981", // Green
    createdAt: "2024-01-20T10:00:00Z",
    updatedAt: "2024-01-20T10:00:00Z",
  },

  // Rooftop Lounge (venueId: "2")
  {
    id: "type-2-1",
    venueId: "2",
    name: "Standard Table",
    description: "Regular table reservation",
    requiresPayment: false,
    color: "#3b82f6", // Blue
    createdAt: "2024-01-20T10:00:00Z",
    updatedAt: "2024-01-20T10:00:00Z",
  },
  {
    id: "type-2-2",
    venueId: "2",
    name: "Premium Lounge",
    description: "Exclusive rooftop seating with panoramic views",
    requiresPayment: true,
    amount: 50.0,
    color: "#8b5cf6", // Purple
    createdAt: "2024-01-25T10:00:00Z",
    updatedAt: "2024-01-25T10:00:00Z",
  },

  // Add default types for remaining venues (ids 3, 4, 5+)
  // Venue 3
  {
    id: "type-3-1",
    venueId: "3",
    name: "Standard Table",
    description: "Regular table reservation",
    requiresPayment: false,
    color: "#3b82f6", // Blue
    createdAt: "2024-02-01T10:00:00Z",
    updatedAt: "2024-02-01T10:00:00Z",
  },

  // Venue 4
  {
    id: "type-4-1",
    venueId: "4",
    name: "Standard Table",
    description: "Regular table reservation",
    requiresPayment: false,
    color: "#3b82f6", // Blue
    createdAt: "2024-02-05T10:00:00Z",
    updatedAt: "2024-02-05T10:00:00Z",
  },

  // Venue 5
  {
    id: "type-5-1",
    venueId: "5",
    name: "Standard Table",
    description: "Regular table reservation",
    requiresPayment: false,
    color: "#3b82f6", // Blue
    createdAt: "2024-02-10T10:00:00Z",
    updatedAt: "2024-02-10T10:00:00Z",
  },
];

// Default reservation type IDs per venue (first type created for each venue)
export const defaultReservationTypeIds: Record<string, string> = {
  "1": "type-1-1", // The Iron Horse
  "2": "type-2-1", // Rooftop Lounge
  "3": "type-3-1",
  "4": "type-4-1",
  "5": "type-5-1",
};