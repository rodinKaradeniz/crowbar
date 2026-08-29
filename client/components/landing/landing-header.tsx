import Link from "next/link";

import { Button } from "@/components/ui/button";

const SECTIONS = [
  { href: "#night", label: "A night" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#faq", label: "Questions" },
];

/**
 * Sticky, translucent, hairline-bottomed.
 *
 * No auto-hide. The retired header slid away on scroll-down and returned on
 * scroll-up, which is motion carrying no meaning — §07 allows motion only where
 * it does. It also cost a scroll listener and a client boundary on a page that
 * is otherwise entirely static.
 */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[var(--paper-veil)] backdrop-blur-[8px]">
      <div className="mkt-shell mkt-header-bar mkt-gap-header flex items-center">
        <Link href="#top" className="flex shrink-0 items-center gap-[9px]">
          <span className="mkt-logo-mark block bg-primary" aria-hidden />
          <span className="mkt-logo-type">CROWBAR</span>
        </Link>

        <nav className="mkt-gap-nav ml-auto flex flex-wrap items-center justify-end text-[length:var(--ui-size)] font-medium text-text-secondary">
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
      </div>
    </header>
  );
}
