import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * `#night` is a walk-through of one service from the door to close-out, and
 * `#capabilities` is the five areas the product covers — so they are named for
 * what a visitor gets by clicking, not for what the sections are called.
 */
const SECTIONS = [
  { href: "#night", label: "How it works" },
  { href: "#capabilities", label: "What you get" },
  { href: "#faq", label: "Questions" },
];

/**
 * Sticky, translucent, hairline-bottomed.
 *
 * No auto-hide. The retired header slid away on scroll-down and returned on
 * scroll-up, which is motion carrying no meaning — §07 allows motion only where
 * it does. It also cost a scroll listener and a client boundary on a page that
 * is otherwise entirely static.
 *
 * BELOW `--bp-phone` THE NAV COLLAPSES BEHIND A DISCLOSURE. Five items — three
 * section links, a sign-in and a button — wrapped onto two and three lines on a
 * phone and read as a pile rather than a nav. `.mkt-header-bar` is a
 * `min-height` precisely so that wrap would not clip, which kept it legal but
 * never made it legible.
 *
 * It is a native `<details>`, not a client component with open state. This page
 * has no JavaScript, no client boundary and no hydration gate, and a menu is
 * not a good enough reason to give it all three: `<details>` is keyboard
 * operable, screen-reader announced and works with JS disabled. `group-open:`
 * swaps the icon off the element's own open state, so nothing needs to be
 * tracked in React.
 */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[var(--paper-veil)] backdrop-blur-[8px]">
      <div className="mkt-shell mkt-header-bar mkt-gap-header flex items-center">
        <Link href="#top" className="flex shrink-0 items-center gap-[9px]">
          <span className="mkt-logo-mark block bg-primary" aria-hidden />
          <span className="mkt-logo-type">CROWBAR</span>
        </Link>

        {/* ≥ phone: the nav as it has always been. */}
        <nav className="mkt-gap-nav ml-auto hidden items-center justify-end text-[length:var(--ui-size)] font-medium text-text-secondary phone:flex">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="border-b border-transparent py-1.5 hover:border-primary hover:text-foreground"
            >
              {section.label}
            </Link>
          ))}

          <Link href="/auth/login" className="py-1.5 font-semibold text-foreground">
            Sign in
          </Link>

          <Button asChild size="md">
            <Link href="/auth/register">Start a workspace</Link>
          </Button>
        </nav>

        {/* < phone: the same links behind a disclosure. */}
        <details className="mkt-nav-disclosure group ml-auto phone:hidden">
          <summary
            className="mkt-nav-toggle flex items-center justify-center text-foreground"
            aria-label="Menu"
          >
            {/* Two icons, one shown at a time off the parent's open state. */}
            <svg
              className="block size-5 group-open:hidden"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="square"
              aria-hidden
            >
              <path d="M3 5.5h14M3 10h14M3 14.5h14" />
            </svg>
            <svg
              className="hidden size-5 group-open:block"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="square"
              aria-hidden
            >
              <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />
            </svg>
          </summary>

          <nav className="mkt-nav-sheet">
            {SECTIONS.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="mkt-nav-sheet-link border-b border-border text-text-secondary"
              >
                {section.label}
              </Link>
            ))}

            <Link
              href="/auth/login"
              className="mkt-nav-sheet-link border-b border-border font-semibold text-foreground"
            >
              Sign in
            </Link>

            <Button asChild size="md" className="mt-4 w-full">
              <Link href="/auth/register">Start a workspace</Link>
            </Button>
          </nav>
        </details>
      </div>
    </header>
  );
}
