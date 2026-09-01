import Link from "next/link";

import { SETTLE_STEP } from "@/components/landing/settle";

/**
 * The full-bleed ink band: six moments of one night, in one record.
 *
 * `ground-ink` re-grounds the section, so `text-primary` here is the lit green
 * rather than the deep green used on paper — the same mechanism the product
 * uses, applied to one band of a paper page.
 */
const MOMENTS = [
  {
    time: "18:40",
    title: "Arrives",
    body: "Booked last Tuesday, or scanned the code by the door two minutes ago.",
    where: "Booking page · Queue",
  },
  {
    time: "18:42",
    title: "Seated",
    body: "The host taps T7 on the floor map. The table turns live and the queue moves up.",
    where: "Floor map",
  },
  {
    time: "18:51",
    title: "Orders",
    body: "From the QR menu at the table, or from a server's tablet. Same tab either way.",
    where: "QR menu · Tab",
  },
  {
    time: "19:04",
    title: "Served",
    body: "The bartender clears the ticket. The pour comes out of stock in the same motion.",
    where: "Bar board · Inventory",
  },
  {
    time: "20:28",
    title: "Settled externally",
    body: "Your own register takes the money. A server marks the tab settled externally; Crowbar records who did it and at what time.",
    where: "Tab · Staff log",
  },
  {
    time: "20:30",
    title: "Closed out",
    body: "The tab closes, the table opens again, and the night's numbers are already written.",
    where: "Floor map · Reports",
  },
];

export function NightTimeline() {
  return (
    <section
      id="night"
      className="mkt-anchor mkt-sec-night ground-ink bg-background text-foreground"
    >
      {/* Full-bleed <section> for the band; `.mkt-shell` for the content, so
          this band's left edge is the same one every paper section uses. */}
      <div className="mkt-shell">
        <div className="mkt-band-head settle flex flex-wrap items-end gap-5">
          <p className="mkt-kicker shrink-0 tracking-[0.15em] text-primary">
            One connected record
          </p>
          <h2 className="mkt-d2 flex-[1_1_100%]">
            A night, from the door
            <br />
            to close-out.
          </h2>
          <p className="mkt-body-lg max-w-[64ch] text-muted-foreground">
            Six moments, one record. Not five products that integrate — one
            workspace where the booking, the order, the pour and the total are
            the same row in the same book.
          </p>
        </div>

        <ol className="grid grid-cols-[repeat(auto-fit,minmax(196px,1fr))] border-t border-primary">
          {MOMENTS.map((moment, index) => (
            <li
              key={moment.time}
              className={[
                "mkt-pad-step",
                index === MOMENTS.length - 1 ? "" : "border-r border-border",
                // Left-to-right within the row: the six moments are one night in
                // order, so they arrive in that order.
                SETTLE_STEP[index % SETTLE_STEP.length],
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <p className="mkt-stamp mb-[18px] tracking-[0.1em] text-primary">
                {moment.time}
              </p>
              <h3 className="mkt-step-title mb-2">{moment.title}</h3>
              <p className="mkt-item-lg mb-4 text-muted-foreground">
                {moment.body}
              </p>
              <p className="type-label text-text-on-ink-faint">
                {moment.where}
              </p>
            </li>
          ))}
        </ol>

        {/*
          The claim and the way to read more about it are two things, so they sit
          on two lines. They shared one baseline row before, which on a wide
          viewport crowded the link up against the end of a legally load-bearing
          sentence and made it look like punctuation.

          The wording is unchanged and not ours to edit: the register is the
          payment and fiscal authority, and what Crowbar records is a staff
          assertion with a name and a timestamp.
        */}
        <div className="mt-6 flex flex-col items-start gap-4 border-t border-border pt-[18px]">
          <p className="mkt-body-sm max-w-[76ch] text-muted-foreground">
            <strong className="font-semibold text-foreground">
              Crowbar never takes the money.
            </strong>{" "}
            Your register stays the payment and fiscal authority. Crowbar records
            the staff assertion that settlement completed, with a name and a
            timestamp against it.
          </p>
          {/* A real destination — #faq is the register question, which leads
              that list. */}
          <Link
            href="#faq"
            className="mkt-kicker border-b border-border pb-[3px] text-primary"
          >
            How that works with my register →
          </Link>
        </div>
      </div>
    </section>
  );
}
