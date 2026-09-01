import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * The brand band — the only surface in the system that is neither paper nor
 * ink. Its primary action inverts: paper fill, deep-green text. That is a
 * marketing signature the canvas declares once, so it is written here rather
 * than added as a Button variant the product could reach for by accident.
 *
 * "Thirty days" is a commercial claim, not a product state. There is no
 * subscription or trial model on `Business`, which is why the zero state does
 * not show a trial countdown. Confirm the offer before this ships publicly.
 */
export function ClosingCta() {
  return (
    <section className="mkt-sec-cta border-t border-ink bg-primary text-[var(--brand-wash)]">
      {/* Full-bleed band, `.mkt-shell` content — see the note on `.mkt-shell`. */}
      <div className="mkt-shell mkt-gap-cta flex flex-wrap items-end">
        <div className="settle min-w-[min(100%,320px)] flex-[1_1_420px]">
          <h2 className="mkt-d2-cta">
            Open your
            <br />
            workspace before
            <br />
            Friday service.
          </h2>
        </div>

        <div className="settle-2 min-w-[min(100%,300px)] flex-[0_1_380px]">
          <p className="mkt-body-lg mb-6 text-[var(--brand-lit-faint)]">
            Thirty days, your real menu, your real floor, your register
            untouched. If it hasn&apos;t replaced the clipboard by the end of
            the month, walk away.
          </p>

          <div className="mkt-gap-actions flex flex-wrap items-center">
            <Button
              asChild
              size="auth"
              className="border-[var(--paper)] bg-paper text-primary hover:border-[var(--white)] hover:bg-[var(--white)]"
            >
              <Link href="/auth/register">Start a workspace</Link>
            </Button>
            <Link
              href="/auth/login"
              className="mkt-body-sm border-b border-[var(--brand-veil)] px-2 py-4 font-semibold text-[var(--brand-wash)] hover:text-[var(--white)]"
            >
              or sign in <span aria-hidden>&#8599;</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
