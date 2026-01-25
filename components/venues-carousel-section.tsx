"use client";

import { useState } from "react";
import { CardsCarousel, VenueCard } from "@/components/cards-carousel";
import { VenueDetailsDialog } from "@/components/venue-details-dialog";
import { Venue } from "@/types";

interface VenuesCarouselSectionProps {
  venues: Venue[];
}

export function VenuesCarouselSection({ venues }: VenuesCarouselSectionProps) {
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCardClick = (venue: Venue) => {
    setSelectedVenue(venue);
    setIsDialogOpen(true);
  };

  const carouselItems = venues.map((venue, index) => (
    <VenueCard
      key={venue.id}
      card={{
        src: venue.image || "",
        title: venue.name,
        category: venue.tags?.[0] || "Venue",
        content: venue.description || "Experience great atmosphere and service",
      }}
      index={index}
      layout={false}
      onClick={() => handleCardClick(venue)}
    />
  ));

  return (
    <>
      <CardsCarousel items={carouselItems} />
      <VenueDetailsDialog
        venue={selectedVenue}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </>
  );
}
