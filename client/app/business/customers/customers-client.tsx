"use client";

import { useState, useMemo, Fragment } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, Eye } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReservationDetailsDialog } from "@/components/reservation-details-dialog";
import { Reservation, ServiceType } from "@/types";
import { UserResponse } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

interface CustomerWithReservations {
  id: string;
  name: string;
  email: string;
  phone: string;
  reservations: Reservation[];
}

interface CustomersClientProps {
  businessId: string;
  customers: UserResponse[];
  reservations: Reservation[];
  serviceTypes: ServiceType[];
  customerSegments?: Record<string, string>;
}

const SEGMENT_STYLES: Record<string, string> = {
  Champions: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "Loyal Customers": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "Potential Loyalists": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "At Risk": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  "Lost Customers": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  Others: "bg-muted text-muted-foreground",
};

export default function CustomersClient({
  businessId,
  customers,
  reservations,
  serviceTypes,
  customerSegments,
}: CustomersClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);

  // Group reservations by customer
  const allCustomers = useMemo(() => {
    const customerMap = new Map<string, CustomerWithReservations>();

    // Initialize from customers list
    customers.forEach((c) => {
      customerMap.set(c.id, {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone || "",
        reservations: [],
      });
    });

    // Attach reservations to customers
    reservations.forEach((r) => {
      const customer = customerMap.get(r.customerId);
      if (customer) {
        customer.reservations.push(r);
      }
    });

    return Array.from(customerMap.values()).filter(
      (c) => c.reservations.length > 0
    );
  }, [customers, reservations]);

  const serviceTypeMap = useMemo(() => {
    const map = new Map<string, ServiceType>();
    serviceTypes.forEach((st) => map.set(st.id, st));
    return map;
  }, [serviceTypes]);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return allCustomers;

    const query = searchQuery.toLowerCase();
    return allCustomers.filter((customer) => {
      return (
        customer.name.toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query) ||
        customer.phone.toLowerCase().includes(query)
      );
    });
  }, [allCustomers, searchQuery]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getReservationCount = (customerReservations: Reservation[]) => {
    return {
      confirmed: customerReservations.filter((r) => r.status === "confirmed")
        .length,
      pending: customerReservations.filter((r) => r.status === "pending")
        .length,
      cancelled: customerReservations.filter((r) => r.status === "cancelled")
        .length,
      completed: customerReservations.filter((r) => r.status === "completed")
        .length,
    };
  };

  return (
    <div className="page-container">
      <div>
        <h1 className="page-title">Customers</h1>
        <p className="page-description">
          View all customers who have made reservations at your business
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search customers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No customers found.</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Total Reservations</TableHead>
                <TableHead>Status Breakdown</TableHead>
                {customerSegments && Object.keys(customerSegments).length > 0 && (
                  <TableHead>Segment</TableHead>
                )}
                <TableHead className="w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map((customer) => {
                const isExpanded = expandedRows.has(customer.id);
                const counts = getReservationCount(customer.reservations);
                const totalReservations = customer.reservations.length;

                return (
                  <Fragment key={customer.id}>
                    <TableRow>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleRow(customer.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">
                        {customer.name}
                      </TableCell>
                      <TableCell>{customer.email}</TableCell>
                      <TableCell>{customer.phone}</TableCell>
                      <TableCell>{totalReservations}</TableCell>
                      <TableCell>
                        <div className="flex gap-2 flex-wrap">
                          {counts.confirmed > 0 && (
                            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              {counts.confirmed} Confirmed
                            </span>
                          )}
                          {counts.pending > 0 && (
                            <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                              {counts.pending} Pending
                            </span>
                          )}
                          {counts.cancelled > 0 && (
                            <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                              {counts.cancelled} Cancelled
                            </span>
                          )}
                          {counts.completed > 0 && (
                            <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                              {counts.completed} Completed
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {customerSegments && Object.keys(customerSegments).length > 0 && (
                        <TableCell>
                          {customerSegments[customer.id] ? (
                            <span
                              className={cn(
                                "text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap",
                                SEGMENT_STYLES[customerSegments[customer.id]] || SEGMENT_STYLES.Others
                              )}
                            >
                              {customerSegments[customer.id]}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRow(customer.id)}
                        >
                          {isExpanded ? "Hide" : "See"} Reservations
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={customerSegments && Object.keys(customerSegments).length > 0 ? 8 : 7} className="p-0">
                          <div className="bg-muted/50 p-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date & Time</TableHead>
                                  <TableHead>Guests</TableHead>
                                  <TableHead>Service Type</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead className="w-[120px]">
                                    Actions
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {customer.reservations.map((reservation) => {
                                  const reservationDate = parseISO(
                                    reservation.time
                                  );
                                  const serviceType = serviceTypeMap.get(
                                    reservation.serviceTypeId
                                  );

                                  return (
                                    <TableRow key={reservation.id}>
                                      <TableCell>
                                        <div>
                                          <div className="font-medium">
                                            {format(
                                              reservationDate,
                                              "MMM d, yyyy"
                                            )}
                                          </div>
                                          <div className="text-sm text-muted-foreground">
                                            {format(reservationDate, "h:mm a")}
                                          </div>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        {reservation.guests}
                                      </TableCell>
                                      <TableCell>
                                        {serviceType?.name || "N/A"}
                                      </TableCell>
                                      <TableCell>
                                        <span
                                          className={cn(
                                            "text-xs px-2 py-1 rounded-full font-medium",
                                            reservation.status ===
                                              "confirmed" &&
                                              "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                                            reservation.status === "pending" &&
                                              "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
                                            reservation.status ===
                                              "cancelled" &&
                                              "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
                                            reservation.status ===
                                              "completed" &&
                                              "bg-muted text-muted-foreground"
                                          )}
                                        >
                                          {reservation.status}
                                        </span>
                                      </TableCell>
                                      <TableCell>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            setSelectedReservation(reservation)
                                          }
                                        >
                                          <Eye className="h-4 w-4 mr-1" />
                                          Details
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ReservationDetailsDialog
        reservation={selectedReservation}
        open={!!selectedReservation}
        onOpenChange={(open) => !open && setSelectedReservation(null)}
        serviceTypes={serviceTypes}
        customers={customers}
      />
    </div>
  );
}
