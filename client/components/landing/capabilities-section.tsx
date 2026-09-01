/**
 * §01 and §02 of the Landing canvas, on paper.
 *
 * The two rows deliberately do not share a composition — 01 is a two-up
 * comparison, 02 a left-to-right sequence. §04 of the System canvas: the
 * marketing grid is broken on purpose, so nothing reads as a template.
 */
export function CapabilitiesSection() {
  return (
    <section id="capabilities" className="mkt-anchor mkt-shell mkt-sec-cap">
      <div className="mkt-row-head settle flex flex-wrap items-end gap-6">
        <h2 className="mkt-d2-cap flex-[1_1_420px]">
          Five areas.
          <br />
          One system underneath.
        </h2>
        <p className="mkt-body-sm flex-[0_1_340px] text-text-secondary">
          Each one is useful on its own. Together they mean a table&apos;s
          booking, its order, its stock draw and its total are the same record.
        </p>
      </div>

      <ReservationsRow />
      <QueueRow />
    </section>
  );
}

/**
 * The section header row: number, title, body.
 *
 * One layout for every section that has all three, so the heads align down the
 * page. `.mkt-head` owns the spacing — the number tight against the title it
 * labels, the body flushed to the right edge in its own column.
 */
function RowHeading({
  number,
  title,
  body,
}: {
  number: string;
  title: React.ReactNode;
  body: string;
}) {
  return (
    <div className="mkt-head mb-[26px]">
      <div className="mkt-head-lead">
        <span className="mkt-num text-text-faint">{number}</span>
        <h3 className="mkt-d3">{title}</h3>
      </div>
      <p className="mkt-head-body mkt-body text-text-body">{body}</p>
    </div>
  );
}

/** The clipboard, as it actually looks on a Friday — and the same book kept once. */
function ReservationsRow() {
  return (
    <div className="mkt-row border-t border-ink border-b border-b-border">
      <RowHeading
        number="01"
        title="Reservations & a public booking page"
        body="Guests book against your real availability. The same book you kept by hand, kept by everyone at once."
      />

      <div className="mkt-gap-cards grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        <div className="settle border border-border bg-paper-tint">
          <p className="mkt-cell-label type-label border-b border-border text-text-faint">
            Friday, on the clipboard
          </p>
          <div className="mkt-note p-3.5 font-mono leading-[2.1] text-text-muted">
            <div className="border-b border-dashed border-border-strong">
              19:00 Okonkwo 4p <span className="line-through">T5</span> T7
            </div>
            <div className="border-b border-dashed border-border-strong line-through">
              19:15 Marchetti 2p — cxl?
            </div>
            <div className="border-b border-dashed border-border-strong">
              19:30 ??? 6p (Sonja hat notiert)
            </div>
            <div className="border-b border-dashed border-border-strong">
              20:00 Bell 6p — allergie??
            </div>
            <div className="text-text-faintest">20:15 ————————</div>
          </div>
          <p className="mkt-cell mkt-note-sm border-t border-border text-text-muted">
            One copy. One person can read it. Gone by Sunday.
          </p>
        </div>

        <div className="settle-2 border border-ink bg-paper-raised">
          <p className="mkt-cell-label type-label border-b border-ink text-foreground">
            Friday, in Crowbar
          </p>
          <div className="px-3.5">
            {[
              ["19:00", "Okonkwo ×4", "T7 · 4th visit", true],
              ["19:15", "Marchetti ×2", "Guest cancelled", false],
              ["19:30", "Weber ×6", "Booked online", false],
              ["20:00", "Bell ×6", "Note · shellfish", false],
            ].map(([time, party, note, isBrand]) => (
              <div
                key={time as string}
                className="mkt-item flex justify-between gap-2.5 border-b border-line-soft py-[11px]"
              >
                <span className="mkt-note-sm font-mono text-text-muted">
                  {time}
                </span>
                <span className="flex-1">{party}</span>
                <span
                  className={
                    isBrand
                      ? "mkt-tag text-primary"
                      : "mkt-tag text-text-secondary"
                  }
                >
                  {note}
                </span>
              </div>
            ))}
            <div className="mkt-item flex justify-between gap-2.5 py-[11px] text-text-faint">
              <span className="mkt-note-sm font-mono">20:15</span>
              <span className="flex-1">Two tables free</span>
              <span className="mkt-tag">Bookable</span>
            </div>
          </div>
          <p className="mkt-cell mkt-note-sm border-t border-border text-text-secondary">
            Every device, every shift, and still there in March.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Three steps, joined edge to edge — the middle one is the one that matters.
 *
 * The shared edges are only removed once the three sit in a row. The canvas
 * zeroes them unconditionally, which leaves step 1 missing its right border and
 * step 3 missing its left when they stack on a narrow screen.
 */
function QueueRow() {
  return (
    <div className="mkt-row border-b border-ink">
      <RowHeading
        number="02"
        title="The walk-in queue, joined by QR"
        body="Three steps, no clipboard, and nobody's name shouted across the room."
      />

      <div className="flex flex-wrap items-stretch">
        <div className="mkt-pad settle min-w-[min(100%,230px)] flex-[1_1_240px] border border-border md:border-r-0 bg-paper-raised">
          <p className="type-label mb-3.5 text-text-faint">
            Step 1 · 21:04
          </p>
          <p className="mkt-strip-title mb-4">Scans the code by the door</p>
          <div className="border border-border bg-paper p-3">
            <p className="mkt-item mb-2 font-medium">Party of 2 · mobile</p>
            <p className="mkt-stamp text-text-muted">+49 176 ••• 4102</p>
          </div>
        </div>

        <div className="mkt-pad settle-2 min-w-[min(100%,230px)] flex-[1_1_240px] border border-ink bg-paper-raised">
          <p className="type-label mb-3.5 text-primary">Step 2 · 21:04</p>
          <p className="mkt-strip-title mb-4">In the queue, position 3</p>
          <div className="flex items-end gap-2.5">
            <p className="mkt-fig-lg">25</p>
            <p className="mkt-stamp-sm mb-1.5 text-text-muted">
              Min quoted
              <br />
              from your real turn times
            </p>
          </div>
        </div>

        <div className="mkt-pad settle-3 min-w-[min(100%,230px)] flex-[1_1_240px] border border-border md:border-l-0 bg-paper-raised">
          <p className="type-label mb-3.5 text-text-faint">
            Step 3 · 21:26
          </p>
          <p className="mkt-strip-title mb-4">Table ready — text sent</p>
          <div className="border-l-2 border-primary bg-brand-wash-2 p-3">
            <p className="mkt-item leading-[1.45] text-brand-tint-ink">
              &ldquo;Zur Eiche: your table is ready. Come to the bar and ask for
              Theo.&rdquo;
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
