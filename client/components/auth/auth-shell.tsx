import Link from "next/link";

/**
 * The auth surfaces are the hinge between the two grounds: an ink panel beside
 * a paper form, inside one hairline box on a tinted page.
 *
 * NOTHING TENANT-SPECIFIC BEFORE SIGN-IN. No venue name, no live status, no
 * "doors at 17:00" — a sign-in page does not know who is arriving, and a
 * venue's live status is not public. The one exception is a staff invitation:
 * the tokenised link carries the venue, so that panel may name it.
 */
export function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    // `m-auto` rather than `justify-center`: a card taller than the viewport
    // still scrolls to its own top, which `justify-center` would cut off.
    <main className="auth-page flex min-h-svh bg-paper-tint">
      <div className="m-auto w-full max-w-[1100px]">{children}</div>
    </main>
  );
}

/** The two-pane box. The panel takes the ink ground; the form stays on paper. */
export function AuthSplit({
  panel,
  panelSide = "start",
  children,
}: {
  panel: React.ReactNode;
  /** Register puts the form first and the panel second — §02 of the canvas. */
  panelSide?: "start" | "end";
  children: React.ReactNode;
}) {
  const form = (
    <div className="auth-pane flex min-w-[min(100%,320px)] flex-[1_1_420px] flex-col justify-center">
      <div className="w-full max-w-[410px]">
        {/* The panel carries the lockup on a wide screen. Below --bp-phone the
            panel is gone, so the mark comes back here — otherwise the first
            screen of the product introduces itself with no name on it. */}
        <div className="mb-8 phone:hidden">
          <AuthMark size="sm" />
        </div>
        {children}
      </div>
    </div>
  );

  /*
   * BELOW --bp-phone THE INK PANEL IS NOT RENDERED.
   *
   * Stacked, the panel put roughly a screen of marketing above the form, so
   * signing in on a phone began by scrolling past it. The panel is pure
   * marketing — it names no venue and carries nothing you need in order to
   * sign in — and someone opening /auth/login on a phone is staff starting a
   * shift, not a prospect being sold to.
   *
   * `hidden` rather than a second copy of the form: one form, one DOM node,
   * nothing to keep in sync. It also keeps the screen on ONE ground, where
   * stacking would have put ink under paper inside a single hairline box —
   * §"grounds are fixed by surface", which stacking would quietly break.
   *
   * `min-h-[600px]` is also phone-only-off: it is a floor for a two-column box
   * and on a phone it is just empty space under a short form.
   */
  return (
    <div className="flex flex-wrap border border-ink bg-paper phone:min-h-[600px]">
      {panelSide === "start" ? panel : form}
      {panelSide === "start" ? form : panel}
    </div>
  );
}

/** The ink half. Everything inside it resolves against the ink ground. */
export function AuthPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-panel ground-ink hidden min-w-[min(100%,300px)] flex-[1_1_380px] flex-col justify-between gap-10 bg-background text-foreground phone:flex">
      {children}
    </div>
  );
}

/**
 * The lockup. `tone` picks the mark's colour: brand on either ground, or
 * critical on a screen whose whole subject is a dead link.
 */
export function AuthMark({
  tone = "brand",
  size = "default",
}: {
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

/**
 * A single-pane screen — forgot password, reset, expired link. Same hairline
 * box, one column, and its own ground.
 */
export function AuthCard({
  ground = "paper",
  children,
}: {
  ground?: "paper" | "ink" | "brand";
  children: React.ReactNode;
}) {
  const skin =
    ground === "ink"
      ? "ground-ink border-ink bg-background text-foreground"
      : ground === "brand"
        ? "border-ink bg-primary text-[var(--brand-wash)]"
        : "border-ink bg-paper";

  return (
    <div className={`auth-card flex flex-col border ${skin}`}>{children}</div>
  );
}

/**
 * A quiet way out of an auth screen, on its own 44px line.
 *
 * Not a button variant: the way back is never the action on the page it is on,
 * and giving it a border would put two things that look like controls beside
 * each other. It is a real <Link>, so it is keyboard reachable and middle-
 * clickable like any other.
 */
export function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      // `muted-foreground`, not a pinned paper tone: this renders on the ink
      // dead-link card as well as on paper, and must resolve per ground.
      className={`inline-flex h-[var(--control-desktop)] items-center text-[length:var(--ui-size)] text-muted-foreground hover:text-primary ${className ?? ""}`}
    >
      {label}
    </Link>
  );
}

/** "← Back to sign in", the commonest one. */
export function BackToSignIn({
  label = "← Back to sign in",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return <BackLink href="/auth/login" label={label} className={className} />;
}
