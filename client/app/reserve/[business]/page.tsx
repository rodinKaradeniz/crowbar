import type { Metadata } from "next";
import ReserveClient from "./reserve-client";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { fetchBusinessBySlug, fetchServiceTypesByBusiness } from "@/lib/api";
import { RegionalSettingsProvider } from "@/contexts/regional-context";
import { renderableImageSrc } from "@/lib/image-url";

interface ReservePageProps {
  params: Promise<{ business: string }>;
}

export async function generateMetadata({ params }: ReservePageProps): Promise<Metadata> {
  const { business: slug } = await params;
  const business = await fetchBusinessBySlug(slug);
  if (!business) return { title: "Reserve · Crowbar" };

  const title = `Reserve at ${business.name} · Crowbar`;
  const description =
    business.description ?? `Book a spot at ${business.name} on Crowbar.`;
  // Only an absolute URL can be a social-share image, so a relative path under
  // client/public — which `next/image` renders perfectly well on the page —
  // yields no OG image. That is accepted: it degrades to a card with a correct
  // title and description, /reserve/* is already `noindex, nofollow`, and
  // rewriting a relative path to an absolute one would need a configured public
  // origin this app does not have. The predicate reuses the render-side rule so
  // an `http://` value left over from before the save boundary existed cannot
  // become an OG image either.
  const renderable = renderableImageSrc(business.image);
  const ogImage = renderable?.startsWith("https://")
    ? [{ url: renderable, width: 1200, height: 630, alt: business.name }]
    : [];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage,
      type: "website",
    },
  };
}

export default async function ReservePage({ params }: ReservePageProps) {
  const { business: businessSlug } = await params;
  const business = await fetchBusinessBySlug(businessSlug);

  if (!business) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <div className="w-full max-w-md px-6 py-16 text-center">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="type-d3 mb-2">Business Not Found</h1>
          <p className="text-muted-foreground mb-6 break-words">
            The business &quot;{businessSlug}&quot; doesn&apos;t exist or is no longer
            available.
          </p>
          <Link href="/" className="text-primary hover:underline">
            Go back to home
          </Link>
        </div>
      </div>
    );
  }

  const serviceTypes = await fetchServiceTypesByBusiness(business.id);

  return (
    <RegionalSettingsProvider settings={{
      countryCode: business.countryCode,
      currencyCode: business.currencyCode,
      locale: business.locale,
      timezone: business.timezone,
      taxLabel: business.taxLabel,
    }}>
      <ReserveClient business={business} serviceTypes={serviceTypes} />
    </RegionalSettingsProvider>
  );
}
