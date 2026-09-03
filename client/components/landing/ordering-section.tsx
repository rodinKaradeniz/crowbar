/**
 * §03 — QR ordering, ticket boards, running tabs.
 *
 * THIS WAS THE ONLY ONE OF THE FIVE ON INK, which made it read as a different
 * kind of thing rather than the third of five. The band is paper now, like the
 * other four — but the two panels stay ink, and that is not a compromise: the
 * bar board and the tab really are the ink product, and the section is showing
 * them. `.ground-ink` on each panel is the mechanism, exactly as `AuthPanel`
 * uses it — every token inside resolves against the ink ground while the
 * section around it resolves against paper.
 *
 * The bar board shows one ticket timer in the attend colour. That is the
 * design's depiction of a ticket approaching its target time — a capability the
 * boards cannot currently derive, because no target threshold is stored
 * anywhere. Kept as the canvas draws it, and recorded against the ticket-target
 * gap in `docs/TODO.md` §7a: when targets ship, the product matches this page.
 *
 * The tab total is written in German format because this is an illustration
 * with no tenant behind it. Every figure in the product goes through
 * `lib/money.ts` with the venue's own configured locale.
 */
export function OrderingSection() {
  return (
    <section
      id="ordering"
      className="mkt-anchor mkt-band mkt-sec-feature bg-paper"
    >
      {/* Full-bleed band, `.mkt-shell` content — see the note on `.mkt-shell`. */}
      <div className="mkt-shell mkt-gap-split flex flex-wrap items-start">
        <div className="mkt-col settle flex-[1_1_400px]">
          <div className="mkt-head-lead mb-[var(--space-16)]">
            <span className="mkt-num text-text-faint">03</span>
            <h3 className="mkt-d3-lg">
              QR ordering, ticket boards,
              <br />
              running tabs
            </h3>
          </div>

          <p className="mkt-body-lg mb-[22px] max-w-[50ch] text-text-body">
            The guest orders from the table. The kitchen and the bar each get
            only their own tickets, in the order they arrived, ageing as they
            wait. The tab stays open until the party closes out.
          </p>

          <div className="grid max-w-[520px] grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
            {["Split by course", "86 an item live", "Server-entered too"].map(
              (chip) => (
                <span
                  key={chip}
                  className="mkt-chip rounded-[var(--radius-2)] border border-border-strong px-2.5 py-2 text-center text-text-muted"
                >
                  {chip}
                </span>
              ),
            )}
          </div>
        </div>

        <div className="mkt-col settle-2 grid flex-[1_1_460px] grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5">
          <BarBoardPanel />
          <TabPanel />
        </div>
      </div>
    </section>
  );
}

function BarBoardPanel() {
  return (
    <div className="ground-ink border border-surface-raised bg-surface text-foreground">
      <div className="mkt-cell-head type-label flex items-center justify-between border-b border-surface-raised text-text-on-ink-faint">
        <span>Bar board</span>
        <span className="rounded-[var(--radius-2)] border border-border-strong px-[5px] text-text-on-ink-2">
          4
        </span>
      </div>

      <div className="mkt-cell-tight border-b border-surface-3">
        <div className="mkt-chip mb-1.5 flex justify-between tracking-normal normal-case text-text-on-ink-faint">
          <span>T4</span>
          <span className="text-text-on-ink-2">0:41</span>
        </div>
        <p className="mkt-item-lg font-medium">2 × Negroni</p>
        <p className="mkt-note-sm mt-0.5 text-text-on-ink-faint">
          1 × Gimlet, no sugar
        </p>
      </div>

      <div className="mkt-cell-tight border-b border-surface-3">
        <div className="mkt-chip mb-1.5 flex justify-between tracking-normal normal-case text-text-on-ink-faint">
          <span>T9</span>
          <span className="text-attend-text">3:12</span>
        </div>
        <p className="mkt-item-lg font-medium">4 × Pils, 0,3 l</p>
      </div>

      <div className="mkt-cell-tight opacity-50">
        <div className="mkt-chip mb-1.5 flex justify-between tracking-normal normal-case text-text-on-ink-faint">
          <span>T2</span>
          <span>Served</span>
        </div>
        <p className="mkt-item-lg font-medium line-through">
          1 × Old Fashioned
        </p>
      </div>
    </div>
  );
}

function TabPanel() {
  const lines: [string, string][] = [
    ["2 × Negroni", "28,00"],
    ["1 × Gimlet", "13,00"],
    ["Padrón-Paprika", "9,50"],
  ];

  return (
    <div className="ground-ink border border-surface-raised bg-surface text-foreground">
      <div className="mkt-cell-head type-label flex items-center justify-between border-b border-surface-raised text-text-on-ink-faint">
        <span>Tab · Tisch 4</span>
        {/* Brand, not severity: an open tab during service is the normal case. */}
        <span className="text-primary">Open</span>
      </div>

      {lines.map(([item, amount]) => (
        <div
          key={item}
          className="mkt-cell-tight mkt-item flex justify-between border-b border-surface-3"
        >
          <span>{item}</span>
          <span className="font-mono">{amount}</span>
        </div>
      ))}

      <div className="flex items-baseline justify-between px-3 py-[13px]">
        <span className="type-label text-text-on-ink-faint">Running</span>
        <span className="mkt-fig-sm">50,50 €</span>
      </div>
    </div>
  );
}
