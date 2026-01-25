import ReserveClient from "./reserve-client";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { getVenueBySlug } from "@/mock-data";

interface ReservePageProps {
  params: Promise<{ venue: string }>;
}

export default async function ReservePage({ params }: ReservePageProps) {
  const { venue: venueSlug } = await params;
  const venue = getVenueBySlug(venueSlug);

  if (!venue) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <div className="w-full max-w-md px-6 py-16 text-center">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="page-title-lg mb-2">Venue Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The venue &quot;{venueSlug}&quot; doesn&apos;t exist or is no longer
            available.
          </p>
          <Link href="/" className="text-primary hover:underline">
            Go back to home
          </Link>
        </div>
      </div>
    );
  }

  return <ReserveClient venue={venue} />;
}
