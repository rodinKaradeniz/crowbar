/**
 * The Crowbar lockup — the square mark plus the wordmark.
 *
 * It lived in `components/auth/auth-shell.tsx` as `AuthMark` while the auth
 * screens were the only surface outside marketing that carried it. The public
 * reservation page is the sixth file to need it, and a guest surface importing
 * `AuthMark` from an auth shell would be a lie about what the component is —
 * so it moved here rather than being re-exported under two names.
 *
 * The mark itself is `.mkt-logo-mark` (11px square), the same declared size the
 * landing header and footer use. `size="sm"` is the 10px/16px pairing for a
 * lockup that sits above a form rather than opening a page.
 */
export function BrandMark({
  tone = "brand",
  size = "default",
}: {
  /**
   * Which colour the mark takes. `critical` is for a screen whose whole
   * subject is a thing that is broken — a dead link — never for decoration.
   */
  tone?: "brand" | "critical" | "paper";
  size?: "default" | "sm";
}) {
  const mark =
    tone === "critical"
      ? "bg-critical-fill"
      : tone === "paper"
        ? "bg-[var(--brand-wash)]"
        : "bg-primary";

  return (
    <div className="flex items-center gap-[9px]">
      <span
        className={
          size === "sm"
            ? `block size-[10px] ${mark}`
            : `mkt-logo-mark block ${mark}`
        }
        aria-hidden
      />
      <span
        className={
          size === "sm"
            ? "font-display text-[16px] font-extrabold tracking-[-0.035em]"
            : "font-display text-[18px] font-extrabold tracking-[-0.035em]"
        }
      >
        CROWBAR
      </span>
    </div>
  );
}
