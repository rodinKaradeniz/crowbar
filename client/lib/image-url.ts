/**
 * The subset of operator-pasted image URLs that are safe to put in an `src`.
 *
 * Mirrors `server/app/core/image_url.validate_image_url`, which refuses the rest
 * at the save boundary. This is the second line rather than the only one: a URL
 * that was valid when it was saved can stop resolving afterwards, which is what
 * `useTenantImage`'s failure latch is for.
 *
 * Deliberately free of "use client" so a server component — the reserve page's
 * `generateMetadata` — can apply the same rule as the components do.
 */
export function renderableImageSrc(
  value: string | null | undefined,
): string | null {
  const candidate = (value ?? "").trim();
  if (!candidate) return null;
  // Protocol-relative, so it inherits the page's scheme to reach any host.
  if (candidate.startsWith("//")) return null;
  // Served by this app; needs no `next/image` configuration at all.
  if (candidate.startsWith("/")) return candidate;
  return /^https:\/\/[^/\s]/.test(candidate) ? candidate : null;
}
