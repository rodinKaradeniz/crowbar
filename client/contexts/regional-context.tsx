"use client";

import { createContext, useContext } from "react";
import { DocumentLocale } from "@/components/document-locale";

export interface RegionalSettings {
  countryCode: string;
  currencyCode: string;
  locale: string;
  timezone: string;
  taxLabel: string;
}

const DEFAULTS: RegionalSettings = {
  countryCode: "DE",
  currencyCode: "EUR",
  locale: "de-DE",
  timezone: "Europe/Berlin",
  taxLabel: "VAT",
};

const RegionalContext = createContext<RegionalSettings>(DEFAULTS);

export function RegionalSettingsProvider({
  children,
  settings,
}: {
  children: React.ReactNode;
  settings: Partial<RegionalSettings>;
}) {
  const resolved: RegionalSettings = {
    countryCode: settings.countryCode ?? DEFAULTS.countryCode,
    currencyCode: settings.currencyCode ?? DEFAULTS.currencyCode,
    locale: settings.locale ?? DEFAULTS.locale,
    timezone: settings.timezone ?? DEFAULTS.timezone,
    taxLabel: settings.taxLabel ?? DEFAULTS.taxLabel,
  };

  return (
    <RegionalContext.Provider value={resolved}>
      {/* `<html lang>` follows the venue's configured locale. Mounted here
          rather than at each call site because this provider is already the
          one place that knows a tenant has been resolved. */}
      <DocumentLocale locale={resolved.locale} />
      {children}
    </RegionalContext.Provider>
  );
}

export function useRegionalSettings(): RegionalSettings {
  return useContext(RegionalContext);
}
