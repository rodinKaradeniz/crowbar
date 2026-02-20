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
import { ServiceType } from "@/types";

interface ReservationSearchFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  serviceTypeFilter?: string;
  onServiceTypeFilterChange?: (serviceTypeId: string) => void;
  serviceTypes?: ServiceType[];
  businessId?: string;
  showServiceTypeFilter?: boolean;
}

export function ReservationSearchFilter({
  searchQuery,
  onSearchChange,
  serviceTypeFilter,
  onServiceTypeFilterChange,
  serviceTypes = [],
  showServiceTypeFilter = true,
}: ReservationSearchFilterProps) {
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

      {/* Service Type Filter */}
      {showServiceTypeFilter && onServiceTypeFilterChange && serviceTypes.length > 0 && (
        <Select
          value={serviceTypeFilter || "all"}
          onValueChange={(value) =>
            onServiceTypeFilterChange(value === "all" ? "" : value)
          }
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by service type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Service Types</SelectItem>
            {serviceTypes.map((serviceType) => (
              <SelectItem key={serviceType.id} value={serviceType.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: serviceType.color }}
                  />
                  <span>{serviceType.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
