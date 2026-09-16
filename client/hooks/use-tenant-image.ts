"use client";

import { useState } from "react";

import { renderableImageSrc } from "@/lib/image-url";

/**
 * Renders an operator-supplied image URL without letting it take a page down.
 *
 * THE DEFECT THIS EXISTS FOR. `businesses.image` is a URL a venue owner pastes
 * into a settings form, and `next/image` rejects every remote host that
 * `next.config.ts` does not declare — so the first photograph an owner set made
 * the PUBLIC booking page return 500. Nobody caught it because the demo tenant's
 * image has always been NULL.
 *
 * WHY `unoptimized` AND NO `images` CONFIG. `unoptimized` returns the src
 * untouched before the loader runs, so the hostname check is never reached and
 * `next.config.ts` needs no `images` block at all. That is the point, not a
 * side effect: an `images.remotePatterns` entry of `hostname: "**"` would turn
 * the Next optimizer into a fetch proxy for any host an operator can name — a
 * server-side request forgery surface and a bandwidth one. An allowlist instead
 * would only move the failure, since a miss throws exactly as before.
 *
 * WHY A HOOK AND NOT A COMPONENT. The three call sites degrade to three
 * different things: the venue panel drops a whole band and its gradient, the
 * settings preview keeps its frame and drops only the photograph, and the staff
 * avatar falls back to an initials circle. A component covering all three would
 * need `wrapperClassName` and `fallback` props. So the hook owns the three facts
 * that would otherwise be copied — the predicate, `unoptimized`, and the 404
 * latch — and each site keeps its own frame. It returns a prop bag rather than a
 * boolean so `unoptimized` cannot be forgotten at a call site; forgetting it is
 * the whole defect.
 */

type TenantImageProps = {
  src: string;
  unoptimized: true;
  onError: () => void;
};

export function useTenantImage(
  value: string | null | undefined,
): TenantImageProps | null {
  // Latched by URL rather than by a boolean, so typing a new URL into the
  // settings preview clears the previous failure with no effect to reset it.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = renderableImageSrc(value);
  if (src === null || src === failedSrc) return null;
  return { src, unoptimized: true, onError: () => setFailedSrc(src) };
}
