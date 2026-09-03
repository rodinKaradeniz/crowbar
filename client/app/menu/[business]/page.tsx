import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { fetchBusinessBySlug } from "@/lib/api";
import MenuClient from "./menu-client";
import { RegionalSettingsProvider } from "@/contexts/regional-context";

interface MenuPageProps {
  params: Promise<{ business: string }>;
}

export default async function MenuPage({ params }: MenuPageProps) {
  const { business: businessSlug } = await params;
  const business = await fetchBusinessBySlug(businessSlug);

  if (!business) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <div className="w-full max-w-md px-6 py-16 text-center">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="type-t1 mb-2">Venue not found</h1>
          <p className="text-muted-foreground mb-6 break-words">
            The business &quot;{businessSlug}&quot; doesn&apos;t exist or is no longer available.
          </p>
          <Link href="/" className="text-primary hover:underline">
            Go back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <RegionalSettingsProvider settings={{
      countryCode: business.countryCode,
      currencyCode: business.currencyCode,
      locale: business.locale,
      timezone: business.timezone,
      taxLabel: business.taxLabel,
    }}>
      <MenuClient businessId={business.id} businessSlug={business.slug} businessName={business.name} />
    </RegionalSettingsProvider>
  );
}
