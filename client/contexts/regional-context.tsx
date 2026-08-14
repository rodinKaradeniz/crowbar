"use client";

import { createContext, useContext } from "react";

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
  return (
    <RegionalContext.Provider value={{
      countryCode: settings.countryCode ?? DEFAULTS.countryCode,
      currencyCode: settings.currencyCode ?? DEFAULTS.currencyCode,
      locale: settings.locale ?? DEFAULTS.locale,
      timezone: settings.timezone ?? DEFAULTS.timezone,
      taxLabel: settings.taxLabel ?? DEFAULTS.taxLabel,
    }}>
      {children}
    </RegionalContext.Provider>
  );
}

export function useRegionalSettings(): RegionalSettings {
  return useContext(RegionalContext);
}
