"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Venue } from "@/types";

interface VenueBookingClientProps {
  venueId: string;
  initialVenue: Venue | undefined;
}

export default function VenueBookingClient({
  venueId,
  initialVenue,
}: VenueBookingClientProps) {
  const [maxGuests, setMaxGuests] = useState(
    initialVenue?.maxGuests?.toString() || "7"
  );
  const [timeSlotInterval, setTimeSlotInterval] = useState(
    initialVenue?.timeSlotInterval?.toString() || "15"
  );
  const [advanceBookingDays, setAdvanceBookingDays] = useState(
    initialVenue?.advanceBookingDays?.toString() || "30"
  );

  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    // TODO: Save to API with venueId
    setTimeout(() => {
      setIsSaving(false);
    }, 500);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Booking Configuration</h1>
        <p className="page-description">
          Set rules and limits for reservations
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>Reservation Limits</FieldLegend>
            <FieldDescription>
              Configure capacity and timing constraints
            </FieldDescription>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field>
                <FieldLabel htmlFor="maxGuests">Maximum Guests</FieldLabel>
                <Input
                  id="maxGuests"
                  type="number"
                  min="1"
                  max="50"
                  value={maxGuests}
                  onChange={(e) => setMaxGuests(e.target.value)}
                  required
                />
                <FieldDescription>
                  Maximum party size per reservation
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="timeSlotInterval">
                  Time Slot Interval
                </FieldLabel>
                <Input
                  id="timeSlotInterval"
                  type="number"
                  min="5"
                  step="5"
                  value={timeSlotInterval}
                  onChange={(e) => setTimeSlotInterval(e.target.value)}
                  required
                />
                <FieldDescription>
                  Minutes between available slots
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="advanceBookingDays">
                  Advance Booking
                </FieldLabel>
                <Input
                  id="advanceBookingDays"
                  type="number"
                  min="1"
                  value={advanceBookingDays}
                  onChange={(e) => setAdvanceBookingDays(e.target.value)}
                  required
                />
                <FieldDescription>
                  Days customers can book ahead
                </FieldDescription>
              </Field>
            </div>
          </FieldSet>

          <Field>
            <div className="button-group-end">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
