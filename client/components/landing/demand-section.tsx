/**
 * §05 — the seven-night forecast, drawn as bars with the figure above each.
 *
 * Tonight is the brand bar. Every other night is a neutral dust fill, including
 * the 152 on Thursday: a busy night is not a severity. Weekday initials are the
 * canvas's German short forms, matching the venue locale the page is written
 * for; inside the product the same axis comes from `lib/business-time.ts`.
 */
const NIGHTS: {
  label: string;
  covers: string;
  height: string;
  kind: "today" | "peak" | "plain";
}[] = [
  { label: "HEUTE", covers: "84", height: "56%", kind: "today" },
  { label: "SA", covers: "92", height: "61%", kind: "plain" },
  { label: "SO", covers: "48", height: "32%", kind: "plain" },
  { label: "MO", covers: "31", height: "21%", kind: "plain" },
  { label: "DI", covers: "39", height: "26%", kind: "plain" },
  { label: "MI", covers: "66", height: "44%", kind: "plain" },
  { label: "DO", covers: "152", height: "100%", kind: "peak" },
];

export function DemandSection() {
  return (
    <section
      id="demand"
      className="mkt-anchor mkt-band mkt-sec-feature bg-paper"
    >
      <div className="mkt-shell">
        <div className="mkt-gap-split-wide mkt-pb-row flex flex-wrap border-b border-ink">
          <div className="mkt-col settle flex-[1_1_340px]">
            <div className="mkt-head-lead mb-[var(--space-16)]">
              <span className="mkt-num text-text-faint">05</span>
              <h3 className="mkt-d3">Demand you can roster against</h3>
            </div>
            <p className="max-w-[48ch] text-[length:var(--body-size)] leading-[var(--body-lh)] text-text-body text-pretty">
              Crowbar reads your own history — the same weekday, the weather,
              what&apos;s on nearby — and puts a number on the next seven
              nights. You order and roster against something better than a
              hunch.
            </p>
          </div>

          <div className="mkt-gap-bars mkt-col settle-2 flex h-[170px] flex-[1_1_420px] items-end border-b border-ink">
            {NIGHTS.map((night) => (
              <div
                key={night.label}
                className={
                  night.kind === "today"
                    ? "flex h-full flex-[1.25] flex-col items-center justify-end gap-2"
                    : "flex h-full flex-1 flex-col items-center justify-end gap-2"
                }
              >
                <span
                  className={
                    night.kind === "today"
                      ? "font-display text-[20px] font-extrabold tracking-[-0.03em]"
                      : night.kind === "peak"
                        ? "mkt-stamp-sm font-semibold text-foreground"
                        : "mkt-stamp-sm text-text-secondary"
                  }
                >
                  {night.covers}
                </span>
                <span
                  className={
                    night.kind === "today"
                      ? "w-full bg-primary"
                      : night.kind === "peak"
                        ? "w-full border-t-2 border-ink bg-line-dust"
                        : "w-full bg-line-dust"
                  }
                  style={{ height: night.height }}
                  aria-hidden
                />
                <span
                  className={
                    night.kind === "today"
                      ? "py-1.5 font-mono text-[10.5px] font-semibold tracking-[0.06em] text-foreground"
                      : "py-1.5 font-mono text-[10.5px] tracking-[0.06em] text-text-faint"
                  }
                >
                  {night.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
