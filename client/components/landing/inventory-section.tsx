/**
 * §04 — one Negroni leaves the bar and stock moves. Evidence above the text,
 * which is the composition no other section uses.
 *
 * Campari sits at 22% of par and is drawn in the FAINT text colour, not amber.
 * That is the severity rank showing its work on the marketing page: par levels
 * are neutral, always. §08 names them twice as the case that does not qualify.
 * A bottle that runs low is Tuesday's order, not tonight's alarm.
 */
const DEDUCTIONS: [string, string][] = [
  ["Monkey 47 Gin", "−30 ml"],
  ["Campari", "−30 ml"],
  ["Cocchi Vermouth", "−30 ml"],
];

const STOCK: [string, number, string, boolean][] = [
  ["Monkey 47 Gin", 64, "4,5 l", false],
  ["Campari", 22, "0,9 l", true],
  ["Cocchi Vermouth", 81, "3,2 l", false],
];

export function InventorySection() {
  return (
    <section className="mkt-shell mkt-sec-inventory">
      <div className="mb-2 flex flex-wrap items-baseline gap-4">
        <span className="mkt-num mkt-num-col text-text-faint">04</span>
        <p className="type-label text-text-muted">
          One Negroni leaves the bar at 19:04. Nobody types anything.
        </p>
      </div>

      <div className="mb-[26px] flex flex-wrap items-stretch border border-ink">
        <div className="mkt-pad-wide min-w-[min(100%,190px)] flex-[1_1_200px] border-r border-border bg-paper-raised">
          <p className="type-label mb-2.5 text-text-faint">
            Ticket cleared
          </p>
          <p className="mkt-panel-title">1 × Negroni</p>
          <p className="mkt-stamp mt-2 text-text-muted">
            Theo · Bar · 19:04
          </p>
        </div>

        <div className="mkt-pad-wide min-w-[min(100%,300px)] flex-[2_1_340px] border-r border-border bg-paper">
          <p className="type-label mb-3 text-text-faint">
            Recipe deducts
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2.5">
            {DEDUCTIONS.map(([name, amount]) => (
              <div
                key={name}
                className="border-l-2 border-ink py-0.5 pl-2.5"
              >
                <p className="mkt-item font-medium">{name}</p>
                <p className="mkt-note-sm mt-0.5 font-mono text-text-muted">
                  {amount}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mkt-pad-wide min-w-[min(100%,240px)] flex-[1.4_1_260px] bg-paper-raised">
          <p className="type-label mb-3 text-text-faint">
            Stock, immediately
          </p>
          {STOCK.map(([name, percent, remaining, isLow], index) => (
            <div
              key={name as string}
              className={
                index === STOCK.length - 1
                  ? "flex items-center gap-2.5 py-[7px]"
                  : "flex items-center gap-2.5 border-b border-line-soft py-[7px]"
              }
            >
              <span className="mkt-item flex-1">{name}</span>
              <span
                className="mkt-meter block bg-line-soft-2"
                aria-hidden
              >
                <span
                  className={
                    isLow
                      ? "block h-full bg-text-faint"
                      : "block h-full bg-ink"
                  }
                  style={{ width: `${percent}%` }}
                />
              </span>
              <span className="mkt-meter-val mkt-note-sm text-right font-mono">
                {remaining}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mkt-gap-split mkt-pb-row flex flex-wrap border-b border-border">
        <h3 className="mkt-d3 flex-[1_1_320px]">Inventory, down to the pour</h3>
        <p className="mkt-body max-w-[48ch] flex-[1_1_300px] text-text-body">
          Every drink has a recipe, so serving is the only data entry.
          Sunday&apos;s count becomes a check rather than a reconstruction, and
          the variance between poured and counted is a number you can actually
          act on.
        </p>
        <p className="mkt-body max-w-[36ch] flex-[1_1_240px] text-text-body">
          Par levels sit in the background: Campari falls below par on Saturday
          at this rate, which is a note for Tuesday&apos;s order — not an alarm
          during service.
        </p>
      </div>
    </section>
  );
}
