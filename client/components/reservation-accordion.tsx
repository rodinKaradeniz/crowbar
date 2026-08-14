"use client";

import { useMemo } from "react";
import {
  Calendar,
  Clock,
  Users,
  MapPin,
  User,
  Mail,
  Phone,
  Tag,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reservation, ServiceType } from "@/types";
import { CustomerResponse } from "@/lib/api-client";
import { ReactNode } from "react";
import { ReservationOverrideNotice } from "@/components/reservation-override-notice";
import { formatBusinessDate, formatBusinessDateTime, formatBusinessTime } from "@/lib/business-time";
import { useRegionalSettings } from "@/contexts/regional-context";

interface ReservationAccordionProps {
  reservations: Reservation[];
  serviceTypes?: ServiceType[];
  customers?: CustomerResponse[];
  actionButtons?: (reservation: Reservation) => ReactNode;
  detailActions?: (reservation: Reservation) => ReactNode;
  emptyMessage?: string;
  businessTimezone: string;
}

export function ReservationAccordion({
  reservations,
  serviceTypes = [],
  customers = [],
  actionButtons,
  detailActions,
  emptyMessage = "No reservations found.",
  businessTimezone,
}: ReservationAccordionProps) {
  const { locale } = useRegionalSettings();
  const customerMap = useMemo(() => {
    const map = new Map<string, CustomerResponse>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  const serviceTypeMap = useMemo(() => {
    const map = new Map<string, ServiceType>();
    serviceTypes.forEach((st) => map.set(st.id, st));
    return map;
  }, [serviceTypes]);

  if (reservations.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <Accordion type="single" collapsible className="w-full space-y-4">
      {reservations.map((reservation) => {
        const customerInfo = customerMap.get(reservation.customerId);
        const serviceType = serviceTypeMap.get(reservation.serviceTypeId);
        return (
          <AccordionItem
            key={reservation.id}
            value={reservation.id}
            className="rounded-lg border bg-card last:border-b"
          >
            {/* Header row with full width justify-between */}
            <div className="flex items-center justify-between w-full px-6 py-4">
              {/* Left side: Reservation info */}
              <div className="flex items-center gap-6 text-sm flex-1 min-w-0">
                <div className="font-medium text-base">
                  {customerInfo?.name || "Unknown"}
                </div>
                {serviceType && (
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: serviceType.color }}
                    />
                    <span className="text-muted-foreground text-xs">
                      {serviceType.name}
                    </span>
                  </div>
                )}
                <ReservationOverrideNotice reservation={reservation} businessTimezone={businessTimezone} compact />
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{formatBusinessDate(reservation.time, businessTimezone, locale)}</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{formatBusinessTime(reservation.time, businessTimezone, locale)}</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>
                    {reservation.guests}{" "}
                    {reservation.guests === 1 ? "guest" : "guests"}
                  </span>
                </div>
                {serviceType && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{serviceType.name}</span>
                  </div>
                )}
              </div>

              {/* Right side: Action buttons and Details button */}
              <div className="flex items-center gap-2 shrink-0">
                {actionButtons && actionButtons(reservation)}
                <AccordionTrigger className="group hover:no-underline p-0 w-auto [&>svg]:hidden inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all h-8 px-3 bg-background border border-input shadow-xs hover:bg-accent hover:text-accent-foreground">
                  <span className="group-data-[state=open]:hidden">
                    See Details
                  </span>
                  <span className="hidden group-data-[state=open]:inline">
                    Hide Details
                  </span>
                </AccordionTrigger>
              </div>
            </div>

            <AccordionContent className="pb-4 px-6">
              <div className="space-y-4 pt-2">
                {/* Contact Information */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Contact Information</h4>
                  <div className="space-y-2">
                    <div className="contact-row">
                      <User className="contact-icon" />
                      <span className="font-medium">{customerInfo?.name}</span>
                    </div>
                    <div className="contact-row">
                      <Mail className="contact-icon" />
                      <span>{customerInfo?.email}</span>
                    </div>
                    {customerInfo?.phone && (
                      <div className="contact-row">
                        <Phone className="contact-icon" />
                        <span>{customerInfo.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reservation Details */}
                <div className="space-y-3 pt-4 border-t">
                  <h4 className="text-sm font-medium">Reservation Details</h4>
                  <div className="space-y-2">
                    <div className="contact-row">
                      <Calendar className="contact-icon" />
                      <div>
                        <p className="text-sm font-medium">
                          {formatBusinessDate(reservation.time, businessTimezone, locale)}
                        </p>
                        <p className="section-subtitle">
                          {formatBusinessTime(reservation.time, businessTimezone, locale)}
                        </p>
                      </div>
                    </div>
                    <div className="contact-row">
                      <Users className="contact-icon" />
                      <span>
                        {reservation.guests}{" "}
                        {reservation.guests === 1 ? "guest" : "guests"}
                      </span>
                    </div>
                    {serviceType && (
                      <div className="contact-row">
                        <Tag className="contact-icon" />
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: serviceType.color }}
                          />
                          <span>{serviceType.name}</span>
                          <span className="text-muted-foreground text-xs">
                            (Capacity: {serviceType.capacity})
                          </span>
                          {serviceType.description && (
                            <span className="text-muted-foreground text-xs">
                              - {serviceType.description}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Special Notes */}
                {reservation.note && (
                  <div className="space-y-2 pt-4 border-t">
                    <h4 className="text-sm font-medium">Special Notes</h4>
                    <p className="section-subtitle">{reservation.note}</p>
                  </div>
                )}

                <ReservationOverrideNotice reservation={reservation} businessTimezone={businessTimezone} />

                {detailActions && (
                  <div className="border-t pt-4">
                    {detailActions(reservation)}
                  </div>
                )}

                {/* Timestamps */}
                <div className="space-y-2 pt-4 border-t">
                  <h4 className="text-sm font-medium">Request Timeline</h4>
                  <div className="space-y-2">
                    <div className="contact-row">
                      <Clock className="contact-icon" />
                      <span className="text-sm text-muted-foreground">
                        Requested:{" "}
                        {formatBusinessDateTime(reservation.createdAt, businessTimezone, locale)}
                      </span>
                    </div>
                    {reservation.updatedAt !== reservation.createdAt && (
                      <div className="contact-row">
                        <Clock className="contact-icon" />
                        <span className="text-sm text-muted-foreground">
                          Last updated:{" "}
                          {formatBusinessDateTime(reservation.updatedAt, businessTimezone, locale)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
