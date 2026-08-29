import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * 7/5 split, panel flush right, and the "it replaces" strip beneath.
 *
 * The panel is an ILLUSTRATION of a night, not a live feed. It is the one place
 * in the port where font-mono tabular-nums are not read from the API, because there is no
 * tenant here — a visitor to the marketing page has not signed in and has no
 * venue. The names and numbers are the canvas's own sample venue.
 */
export function LandingHero() {
  return (
    <section id="top" className="mkt-shell mkt-sec-hero">
      <div className="mkt-gap-hero flex flex-wrap items-end">
        <div className="min-w-[min(100%,420px)] flex-[1_1_520px]">
          <p className="mkt-eyebrow mb-[22px] text-text-muted">
            For independent bars &amp; restaurants
          </p>

          <h1 className="mkt-d1">
            Run the whole
            <br />
            service from
            <br />
            one screen.
          </h1>

          <p className="mkt-lead mt-7 max-w-[48ch] text-text-body">
            Crowbar is the operations platform for one venue: bookings and the
            walk-in queue at the door, QR ordering and ticket boards through
            service, stock counted down to the pour, and a straight answer at
            the end of the night.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="auth">
              <Link href="/auth/register">Start a workspace</Link>
            </Button>
            <Button asChild size="auth" variant="secondary">
              <Link href="#night">See a night in Crowbar</Link>
            </Button>
          </div>

          <p className="mkt-note mt-5 text-text-muted">
            Free for 30 days. No card. Your register stays exactly where it is.
          </p>
        </div>

        <SampleNightPanel />
      </div>

      <ReplacesStrip />
    </section>
  );
}

function SampleNightPanel() {
  return (
    <figure
      className="m-0 min-w-[min(100%,340px)] flex-[1_1_380px] border border-ink bg-paper-raised"
      aria-label="An example of a night in Crowbar"
    >
      <div className="mkt-cell ground-ink flex items-center justify-between gap-2.5 border-b border-ink bg-background text-foreground">
        <span className="mkt-kicker">Fr, 28. Aug · 19:24</span>
        <span className="mkt-chip flex items-center gap-[7px] text-primary">
          <span className="mkt-dot live-pulse bg-primary" aria-hidden />
          Service open
        </span>
      </div>

      <div className="flex border-b border-border">
        <div className="mkt-cell-tall flex-1 border-r border-border">
          <p className="type-label mb-1.5 text-text-muted">
            Covers expected
          </p>
          <p className="mkt-fig-md">84</p>
        </div>
        <div className="mkt-cell-tall flex-1">
          <p className="type-label mb-1.5 text-text-muted">
            In the queue
          </p>
          <p className="mkt-fig-md">3</p>
        </div>
      </div>

      <div className="mkt-cell mkt-item flex items-center gap-3 border-b border-line-soft">
        <span className="mkt-stamp text-text-muted">19:00</span>
        <span className="font-medium">Okonkwo</span>
        <span className="mkt-stamp text-text-muted">×4</span>
        <span className="mkt-chip ml-auto rounded-[var(--radius-2)] border border-border-strong px-[7px] py-[3px] text-text-secondary">
          T7 seated
        </span>
      </div>

      <div className="mkt-cell mkt-item flex items-center gap-3 border-b border-line-soft">
        <span className="mkt-stamp text-text-muted">19:15</span>
        <span className="font-medium">Marchetti</span>
        <span className="mkt-stamp text-text-muted">×2</span>
        <span className="mkt-chip ml-auto rounded-[var(--radius-2)] border border-border-strong px-[7px] py-[3px] text-text-secondary">
          Due 15 Min
        </span>
      </div>

      <div className="mkt-cell mkt-item flex items-baseline gap-2.5 border-b border-line-soft bg-brand-wash-2">
        <span className="mkt-stamp text-primary">19:21</span>
        <span className="text-[var(--surface-4)]">
          Tisch 4 sent <strong className="font-semibold">2 Negroni</strong> to
          the bar board
        </span>
      </div>

      <div className="mkt-cell mkt-item flex items-baseline gap-2.5">
        <span className="mkt-stamp text-text-muted">19:21</span>
        <span className="text-text-secondary">
          Gin, Monkey 47 — <strong className="font-mono font-semibold">60 ml</strong>{" "}
          out of stock
        </span>
      </div>
    </figure>
  );
}

/**
 * The claim the whole product rests on, said in four cells: Crowbar replaces
 * the paper, and does not replace the register. The last cell is muted, not
 * coloured — it is a fact about scope, not a warning.
 */
function ReplacesStrip() {
  return (
    <div className="mkt-mt-strip flex flex-wrap border-t border-ink border-b border-b-border">
      <div className="flex-[1_1_240px] border-r border-border py-5 pr-[22px]">
        <p className="type-label mb-1.5 text-text-muted">It replaces</p>
        <p className="mkt-strip-title">The clipboard at the door</p>
      </div>
      <div className="flex-[1_1_240px] border-r border-border px-[22px] py-5">
        <p className="type-label mb-1.5 text-text-muted">And</p>
        <p className="mkt-strip-title">The notebook behind the bar</p>
      </div>
      <div className="flex-[1_1_240px] border-r border-border px-[22px] py-5">
        <p className="type-label mb-1.5 text-text-muted">And</p>
        <p className="mkt-strip-title">The spreadsheet in the back office</p>
      </div>
      <div className="flex-[1_1_240px] py-5 pl-[22px]">
        <p className="type-label mb-1.5 text-text-muted">
          It does not replace
        </p>
        <p className="mkt-strip-title text-text-muted">Your register</p>
      </div>
    </div>
  );
}
