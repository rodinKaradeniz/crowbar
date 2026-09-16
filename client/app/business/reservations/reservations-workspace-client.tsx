"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarCheck, Clock, Inbox } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PageBody, PageHeader } from "@/components/page-header";
import { ReservationSearchFilter } from "@/components/reservation-search-filter";
import { ReservationWaitlistPanel } from "@/components/reservation-waitlist-panel";
import ReservationsClient from "./reservations-client";
import RequestsClient from "./requests-client";
import type { Reservation, ReservationWaitlistEntry, ServiceType } from "@/types";
import type { CustomerResponse } from "@/lib/api-client";

interface Props {
  initialReservations: Reservation[];
  initialPendingReservations: Reservation[];
  initialWaitlistEntries: ReservationWaitlistEntry[];
  businessId: string;
  serviceTypes: ServiceType[];
  customers: CustomerResponse[];
  customerSegments: Record<string, string>;
  businessTimezone: string;
  businessMaxGuests: number;
  businessCountryCode: string;
  currentTime: string;
  canOverride: boolean;
  /**
   * Accepting or declining a request, and every waitlist write, is
   * `reservations.manage` on the server. A role holding only
   * `reservations.view` gets the book and nothing it cannot act on.
   */
  canManage: boolean;
}

export function ReservationsWorkspaceClient({
  initialReservations,
  initialPendingReservations,
  initialWaitlistEntries,
  businessId,
  serviceTypes,
  customers,
  customerSegments,
  businessTimezone,
  businessMaxGuests,
  businessCountryCode,
  currentTime,
  canOverride,
  canManage,
}: Props) {
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");

  // A deep link to a tab this role cannot open falls back to the book rather
  // than rendering an empty panel. The backend enforces the same boundary.
  const available = ["book", ...(canManage ? ["requests", "waitlist"] : [])];
  const [tab, setTab] = useState(
    requested && available.includes(requested) ? requested : "book",
  );

  // The book and the requests list are the same rows in two states, so the
  // filter is shared: a host searching for a name keeps that search when they
  // flip between them instead of retyping it.
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("");

  // Owned here because the action that opens it sits in the header, above the
  // tabs — taking a booking is the primary act of this domain from any of them.
  const [creatingReservation, setCreatingReservation] = useState(false);

  return (
    /* The Tabs root wraps the header AND the body: Radix requires TabsList and
       TabsContent under one root, and Book / Requests / Waitlist is this
       page's own navigation — it belongs beside the title, pinned. `contents`
       keeps the root out of the layout so header and body stay the flow
       siblings that sticky needs. Same shape as the inventory workspace. */
    <Tabs value={tab} onValueChange={setTab} className="contents">
      <PageHeader
        wide
        title="Reservations"
        description="The book, the requests waiting on a yes, and the waitlist."
        actions={
          <Button type="button" onClick={() => setCreatingReservation(true)}>
            New reservation
          </Button>
        }
      >
        <TabsList>
          <TabsTrigger value="book">
            <CalendarCheck className="h-4 w-4 mr-1.5" />
            Book
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="requests">
              <Inbox className="h-4 w-4 mr-1.5" />
              Requests
            </TabsTrigger>
          )}
          {canManage && (
            <TabsTrigger value="waitlist">
              <Clock className="h-4 w-4 mr-1.5" />
              Waitlist
            </TabsTrigger>
          )}
        </TabsList>
        {/* The waitlist is not a list of reservations and this filter does not
            apply to it, so it is absent there rather than present and inert. */}
        {tab !== "waitlist" && (
          <ReservationSearchFilter
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            serviceTypeFilter={serviceTypeFilter}
            onServiceTypeFilterChange={setServiceTypeFilter}
            serviceTypes={serviceTypes}
          />
        )}
      </PageHeader>

      <PageBody wide>
        <TabsContent value="book">
          <ReservationsClient
            initialReservations={initialReservations}
            serviceTypes={serviceTypes}
            customers={customers}
            businessTimezone={businessTimezone}
            businessMaxGuests={businessMaxGuests}
            currentTime={currentTime}
            canOverride={canOverride}
            searchQuery={searchQuery}
            serviceTypeFilter={serviceTypeFilter}
            creatingReservation={creatingReservation}
            onCreatingReservationChange={setCreatingReservation}
          />
        </TabsContent>

        {canManage && (
          <TabsContent value="requests">
            <RequestsClient
              initialReservations={initialPendingReservations}
              serviceTypes={serviceTypes}
              customers={customers}
              customerSegments={customerSegments}
              businessTimezone={businessTimezone}
              businessMaxGuests={businessMaxGuests}
              currentTime={currentTime}
              canOverride={canOverride}
              searchQuery={searchQuery}
              serviceTypeFilter={serviceTypeFilter}
            />
          </TabsContent>
        )}

        {canManage && (
          <TabsContent value="waitlist">
            <ReservationWaitlistPanel
              initialEntries={initialWaitlistEntries}
              businessId={businessId}
              businessTimezone={businessTimezone}
              businessMaxGuests={businessMaxGuests}
              serviceTypes={serviceTypes}
              customers={customers}
              businessCountryCode={businessCountryCode}
              canManage={canManage}
            />
          </TabsContent>
        )}
      </PageBody>
    </Tabs>
  );
}
