import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * 7/5 split, panel flush right, and the "it replaces" strip beneath.
 *
 * The panel is an ILLUSTRATION of a night, not a live feed. It is the one place
 * in the port where numbers are not read from the API, because there is no
 * tenant here — a visitor to the marketing page has not signed in and has no
 * venue. The names and numbers are the canvas's own sample venue.
 *
 * THE ROW CENTRES. `items-end` bottom-aligned the shorter panel against the
 * taller text column, so every bit of slack collected into a dead band ABOVE
 * the card and the panel's top edge floated in the middle of the headline.
 *
 * Stretching was tried and is worse: the panel has no honest way to fill the
 * text column's height, so the hole simply moves inside it — either above the
 * last row, or as 240px of air around two figures. Inventing four more rows of
 * sample data to fill a box is not a fix either.
 *
 * So the panel keeps its natural height and is centred on the text body, which
 * splits the remaining difference evenly above and below rather than banking it
 * all at one end. Three rows were added to close most of that difference, and
 * --mkt-d1's maximum came down from 92px to 84px.
 *
 * Nothing here carries `.settle`: this is above the fold on every target, and
 * it must paint complete.
 */
export function LandingHero() {
  return (
    <section id="top" className="mkt-anchor mkt-shell mkt-sec-hero">
      <div className="mkt-gap-hero flex flex-wrap items-center">
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

/**
 * The sample night.
 *
 * Three entries were added in the canvas's own voice when the row stopped
 * bottom-aligning: a third booking, the stock line, and the moment a table is
 * settled. That last one is the claim the whole product rests on, said the only
 * way it may be said — settled externally, against a name and a time. Crowbar
 * did not take the money; it recorded that the register did.
 */
function SampleNightPanel() {
  return (
    <figure
      className="m-0 flex min-w-[min(100%,340px)] flex-[1_1_380px] flex-col border border-ink bg-paper-raised"
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
          <p className="type-label mb-1.5 text-text-muted">Covers expected</p>
          <p className="mkt-fig-md">84</p>
        </div>
        <div className="mkt-cell-tall flex-1">
          <p className="type-label mb-1.5 text-text-muted">In the queue</p>
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

      <div className="mkt-cell mkt-item flex items-center gap-3 border-b border-line-soft">
        <span className="mkt-stamp text-text-muted">19:30</span>
        <span className="font-medium">Weber</span>
        <span className="mkt-stamp text-text-muted">×6</span>
        <span className="mkt-chip ml-auto rounded-[var(--radius-2)] border border-border-strong px-[7px] py-[3px] text-text-secondary">
          Booked online
        </span>
      </div>

      <div className="mkt-cell mkt-item flex items-baseline gap-2.5 border-b border-line-soft bg-brand-wash-2">
        <span className="mkt-stamp text-primary">19:21</span>
        <span className="text-[var(--surface-4)]">
          Tisch 4 sent <strong className="font-semibold">2 Negroni</strong> to
          the bar board
        </span>
      </div>

      <div className="mkt-cell mkt-item flex items-baseline gap-2.5 border-b border-line-soft">
        <span className="mkt-stamp text-text-muted">19:21</span>
        <span className="text-text-secondary">
          Gin, Monkey 47 —{" "}
          <strong className="font-mono font-semibold">60 ml</strong> out of
          stock
        </span>
      </div>

      {/* The one thing a visitor most needs to read, at the foot of the night. */}
      <div className="mkt-cell mkt-item flex items-baseline gap-2.5">
        <span className="mkt-stamp text-text-muted">19:52</span>
        <span className="text-text-secondary">
          Tisch 2 <strong className="font-semibold">settled externally</strong>{" "}
          — Theo, 19:52
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
  // The four cells are a ROW above --bp-phone and a STACK below it, and the
  // two need opposite gutters. The row wants 22px between neighbours, which is
  // why the first cell pads right only and the last pads left only. Stacked,
  // that same padding indents cells 2-4 against a flush cell 1 — the ragged
  // left edge you can see on a phone. So the horizontal padding and the
  // vertical rules are both `phone:`-only, and the stack divides with a bottom
  // hairline instead, which is the divider a stacked list actually wants.
  return (
    <div className="mkt-mt-strip flex flex-wrap border-t border-ink border-b border-b-border">
      <div className="flex-[1_1_240px] border-b border-border py-5 phone:border-b-0 phone:border-r phone:pr-[22px]">
        <p className="type-label mb-1.5 text-text-muted">It replaces</p>
        <p className="mkt-strip-title">The clipboard at the door</p>
      </div>
      <div className="flex-[1_1_240px] border-b border-border py-5 phone:border-b-0 phone:border-r phone:px-[22px]">
        <p className="type-label mb-1.5 text-text-muted">And</p>
        <p className="mkt-strip-title">The notebook behind the bar</p>
      </div>
      <div className="flex-[1_1_240px] border-b border-border py-5 phone:border-b-0 phone:border-r phone:px-[22px]">
        <p className="type-label mb-1.5 text-text-muted">And</p>
        <p className="mkt-strip-title">The back-office spreadsheet</p>
      </div>
      <div className="flex-[1_1_240px] py-5 phone:pl-[22px]">
        <p className="type-label mb-1.5 text-text-muted">But not</p>
        <p className="mkt-strip-title text-text-muted">Your register</p>
      </div>
    </div>
  );
}
