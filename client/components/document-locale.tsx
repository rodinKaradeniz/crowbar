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
 * Known limitation, recorded in docs/DESIGN.md: the UI copy is English while
 * the formatting locale is typically de-DE, so `lang="de-DE"` tells a screen
 * reader to pronounce English copy in German. Content language and formatting
 * locale need to separate once the product is translated.
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
