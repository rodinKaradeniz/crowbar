"use client";

import { useState } from "react";
import Image from "next/image";
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
import { Textarea } from "@/components/ui/textarea";
import { Mail, Phone, MapPin } from "lucide-react";
import { Venue } from "@/types";

interface VenueInfoClientProps {
  venueId: string;
  initialVenue: Venue | undefined;
}

export default function VenueInfoClient({
  venueId,
  initialVenue,
}: VenueInfoClientProps) {
  const [venueName, setVenueName] = useState(initialVenue?.name || "");
  const [venueDescription, setVenueDescription] = useState(
    initialVenue?.description || ""
  );
  const [venueEmail, setVenueEmail] = useState(initialVenue?.email || "");
  const [venuePhone, setVenuePhone] = useState(initialVenue?.phone || "");
  const [venueAddress, setVenueAddress] = useState(initialVenue?.address || "");
  const [venueImage, setVenueImage] = useState(initialVenue?.image || "");

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
    <div className="page-container-split">
      <div className="flex-1">
        <div className="page-header">
          <h1 className="page-title">Venue Information</h1>
          <p className="page-description">
            Basic details visible to customers
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Public Information</FieldLegend>
              <FieldDescription>
                This information is visible to customers when they make reservations
              </FieldDescription>

              <Field>
                <FieldLabel htmlFor="venueName">Venue Name</FieldLabel>
                <Input
                  id="venueName"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="venueDescription">Description</FieldLabel>
                <Textarea
                  id="venueDescription"
                  value={venueDescription}
                  onChange={(e) => setVenueDescription(e.target.value)}
                  rows={3}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="venueEmail">Email</FieldLabel>
                  <Input
                    id="venueEmail"
                    type="email"
                    value={venueEmail}
                    onChange={(e) => setVenueEmail(e.target.value)}
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="venuePhone">Phone</FieldLabel>
                  <Input
                    id="venuePhone"
                    type="tel"
                    value={venuePhone}
                    onChange={(e) => setVenuePhone(e.target.value)}
                    required
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="venueAddress">Address</FieldLabel>
                <Input
                  id="venueAddress"
                  value={venueAddress}
                  onChange={(e) => setVenueAddress(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="venueImage">Image URL</FieldLabel>
                <Input
                  id="venueImage"
                  type="url"
                  value={venueImage}
                  onChange={(e) => setVenueImage(e.target.value)}
                />
              </Field>
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

      <div className="lg:w-80">
        <div className="sticky top-6">
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="relative h-32 w-full">
              {venueImage && (
                <Image
                  src={venueImage}
                  alt={venueName}
                  fill
                  className="object-cover"
                />
              )}
              <div className="absolute inset-0 bg-black/40" />
            </div>
            <div className="p-4 space-y-3">
              <h2 className="font-semibold">{venueName || "Venue Name"}</h2>
              {venueDescription && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {venueDescription}
                </p>
              )}
              <div className="space-y-2 text-sm">
                {venuePhone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <span>{venuePhone}</span>
                  </div>
                )}
                {venueEmail && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    <span className="truncate">{venueEmail}</span>
                  </div>
                )}
                {venueAddress && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{venueAddress}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Customer preview
          </p>
        </div>
      </div>
    </div>
  );
}
