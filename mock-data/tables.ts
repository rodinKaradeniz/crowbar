import { Table } from "@/types";

export const mockTables: Table[] = [
  {
    id: "table-1",
    venueId: "1",
    number: "Table 1",
    capacity: 4,
    status: "available",
  },
  {
    id: "table-2",
    venueId: "1",
    number: "Table 2",
    capacity: 6,
    status: "available",
  },
  {
    id: "table-3",
    venueId: "1",
    number: "Table 3",
    capacity: 2,
    status: "available",
  },
  // Tables for Rooftop Lounge (2)
  {
    id: "table-4",
    venueId: "2",
    number: "Table 1",
    capacity: 4,
    status: "available",
  },
  {
    id: "table-5",
    venueId: "2",
    number: "Table 2",
    capacity: 8,
    status: "available",
  },
  {
    id: "table-6",
    venueId: "2",
    number: "Table 3",
    capacity: 2,
    status: "available",
  },
];
