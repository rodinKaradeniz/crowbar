"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Business } from "@/types";

interface BusinessDetailsDialogProps {
  business: Business | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BusinessDetailsDialog({
  business,
  open,
  onOpenChange,
}: BusinessDetailsDialogProps) {
  if (!business) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <div className="grid md:grid-cols-2 gap-0">
          {/* Left side - Image */}
          <div className="relative h-[300px] md:h-[500px] w-full bg-[radial-gradient(circle_at_30%_24%,#d4a24d_0_7%,transparent_30%),linear-gradient(145deg,#251812,#7b3f27)]">
            {business.image ? (
              <Image
                src={business.image}
                alt={business.name}
                fill
                className="object-cover"
              />
            ) : null}
          </div>

          {/* Right side - Content */}
          <div className="flex flex-col p-6 md:p-8">
            <DialogHeader className="mb-8">
              <DialogTitle className="text-2xl md:text-3xl mb-2">
                {business.name}
              </DialogTitle>
              <DialogDescription className="text-base">
                {business.description}
              </DialogDescription>
            </DialogHeader>

            {/* Tags */}
            {business.tags && business.tags.length > 0 && (
              <div className="mb-6">
                <div className="flex flex-wrap gap-2">
                  {business.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary border border-primary/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Additional Info */}
            <div className="mt-auto space-y-3 mb-6 text-sm text-muted-foreground">
              {business.address && (
                <div>
                  <span className="font-medium">Address: </span>
                  {business.address}
                </div>
              )}
              {business.phone && (
                <div>
                  <span className="font-medium">Phone: </span>
                  {business.phone}
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-3 pt-4 max-w-[200px]">
              <Button asChild size="lg">
                <Link href={`/reserve/${business.slug}`}>Make Reservation</Link>
              </Button>

              {business.website && (
                <Button asChild variant="outline" size="lg">
                  <a
                    href={business.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2"
                  >
                    Visit Website
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
