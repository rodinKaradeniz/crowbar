"use client";

import { useEffect } from "react";

/**
 * Sets `<html lang>` from the venue's configured locale.
 *
 * `<html>` can only be emitted by the root layout, which has no tenant — so
 * the attribute is written here instead, on the surfaces that have actually
 * resolved one (the staff product, and the public guest pages that resolve a
 * venue by slug). Root keeps a neutral default for landing and auth, which
 * are pre-tenant by design.
 *
 * The locale is tenant configuration, never a literal: the design mandates
 * German *formatting* throughout, but that comes from the venue's own
 * region/timezone settings via `useRegionalSettings()`, exactly like money and
 * time do. A venue configured for another region formats — and now announces —
 * as that region.
 *
 * MOUNTED ONCE, IN `contexts/regional-context.tsx`. Every surface that resolves
 * a tenant already renders `RegionalSettingsProvider` — the four public venue
 * pages and the whole staff product — so the attribute follows the provider
 * rather than needing a mount per page. `/reserve/manage/[token]` renders this
 * directly because that surface has no provider.
 *
 * Two known limitations, neither fixable here:
 *
 *   - IT IS A POST-HYDRATION CORRECTION. The server-rendered document ships the
 *     root layout's neutral `lang="en"` and this effect rewrites it once React
 *     runs. In the App Router only the root layout may emit <html>, and the root
 *     layout has no params and no tenant, so the served markup cannot carry the
 *     venue's locale. A crawler that does not execute JavaScript sees `en`.
 *   - The UI copy is English while the formatting locale is typically de-DE, so
 *     `lang="de-DE"` tells a screen reader to pronounce English copy in German.
 *     Content language and formatting locale need to separate once the product
 *     is translated.
 *
 * Presentation only — renders nothing.
 */
export function DocumentLocale({ locale }: { locale: string }) {
  useEffect(() => {
    if (!locale) return;
    const previous = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [locale]);

  return null;
}
