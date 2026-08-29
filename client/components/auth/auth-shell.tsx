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
      <div className="w-full max-w-[410px]">{children}</div>
    </div>
  );

  return (
    <div className="flex min-h-[600px] flex-wrap border border-ink bg-paper">
      {panelSide === "start" ? panel : form}
      {panelSide === "start" ? form : panel}
    </div>
  );
}

/** The ink half. Everything inside it resolves against the ink ground. */
export function AuthPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-panel ground-ink flex min-w-[min(100%,300px)] flex-[1_1_380px] flex-col justify-between gap-10 bg-background text-foreground">
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

/** "← Back to sign in", set on its own 44px line. */
export function BackToSignIn({
  label = "← Back to sign in",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href="/auth/login"
      // `muted-foreground`, not a pinned paper tone: this renders on the ink
      // dead-link card as well as on paper, and must resolve per ground.
      className={`inline-flex h-11 items-center text-[length:var(--ui-size)] text-muted-foreground hover:text-primary ${className ?? ""}`}
    >
      {label}
    </Link>
  );
}
