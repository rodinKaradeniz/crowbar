"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getTablesByVenueId, getReservationTypesByVenueId } from "@/mock-data";
import { Table } from "@/types";

interface ReservationSearchFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  tableFilter?: string;
  onTableFilterChange?: (tableId: string) => void;
  typeFilter?: string;
  onTypeFilterChange?: (typeId: string) => void;
  venueId: string;
  showTableFilter?: boolean;
  showTypeFilter?: boolean;
}

export function ReservationSearchFilter({
  searchQuery,
  onSearchChange,
  tableFilter,
  onTableFilterChange,
  typeFilter,
  onTypeFilterChange,
  venueId,
  showTableFilter = true,
  showTypeFilter = true,
}: ReservationSearchFilterProps) {
  const tables = getTablesByVenueId(venueId);
  const reservationTypes = getReservationTypesByVenueId(venueId);

  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Type Filter */}
      {showTypeFilter && onTypeFilterChange && reservationTypes.length > 0 && (
        <Select
          value={typeFilter || "all"}
          onValueChange={(value) =>
            onTypeFilterChange(value === "all" ? "" : value)
          }
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {reservationTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: type.color }}
                  />
                  <span>{type.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Table Filter */}
      {showTableFilter && onTableFilterChange && (
        <Select
          value={tableFilter || "all"}
          onValueChange={(value) =>
            onTableFilterChange(value === "all" ? "" : value)
          }
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by table" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tables</SelectItem>
            {tables.map((table: Table) => (
              <SelectItem key={table.id} value={table.id}>
                {table.number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}