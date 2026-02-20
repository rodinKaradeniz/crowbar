"use client";

import { useState } from "react";
import { CardsCarousel, BusinessCard } from "@/components/cards-carousel";
import { BusinessDetailsDialog } from "@/components/business-details-dialog";
import { Business } from "@/types";

interface BusinessesCarouselSectionProps {
  businesses: Business[];
}

export function BusinessesCarouselSection({ businesses }: BusinessesCarouselSectionProps) {
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCardClick = (business: Business) => {
    setSelectedBusiness(business);
    setIsDialogOpen(true);
  };

  const carouselItems = businesses.map((business, index) => (
    <BusinessCard
      key={business.id}
      card={{
        src: business.image || "",
        title: business.name,
        category: business.tags?.[0] || "Business",
        content: business.description || "Experience great atmosphere and service",
      }}
      index={index}
      layout={false}
      onClick={() => handleCardClick(business)}
    />
  ));

  return (
    <>
      <CardsCarousel items={carouselItems} />
      <BusinessDetailsDialog
        business={selectedBusiness}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </>
  );
}
