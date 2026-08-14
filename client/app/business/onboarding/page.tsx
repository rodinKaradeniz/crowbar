import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { redirect } from "next/navigation";
import OnboardingWizard from "./onboarding-wizard";

export default async function OnboardingPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const business = await fetchBusiness(user.businessId);

  if (!business) {
    redirect("/auth/login");
  }

  // Guard: if already onboarded, send them to overview
  if (business.onboardingComplete) {
    redirect("/business/overview");
  }

  return (
    <OnboardingWizard
      businessId={business.id}
      initialName={business.name}
      initialDescription={business.description ?? ""}
      initialAddress={business.address ?? ""}
      initialImage={business.image ?? ""}
      initialCountryCode={business.countryCode ?? "DE"}
      initialCurrencyCode={business.currencyCode ?? "EUR"}
      initialLocale={business.locale ?? "de-DE"}
      initialTimezone={business.timezone ?? "Europe/Berlin"}
      initialTaxLabel={business.taxLabel ?? "VAT"}
    />
  );
}
