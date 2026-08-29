import Link from "next/link";

const COLUMNS: { heading: string; basis: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Product",
    basis: "flex-[0_1_160px]",
    links: [
      { href: "#capabilities", label: "Reservations" },
      { href: "#capabilities", label: "Walk-in queue" },
      { href: "#capabilities", label: "QR ordering" },
      { href: "#capabilities", label: "Inventory" },
      { href: "#capabilities", label: "Insights" },
    ],
  },
  {
    heading: "Company",
    basis: "flex-[0_1_160px]",
    links: [
      { href: "#faq", label: "Questions" },
      { href: "mailto:hallo@crowbar.co", label: "Contact" },
    ],
  },
];

/**
 * Ink ground, three columns and a baseline.
 *
 * The canvas carries a fourth column linking the design canvases themselves,
 * and a "Pricing" link. Neither has a destination in this product — the
 * canvases are not published and there is no pricing page — so they are not
 * rendered. A footer link that goes nowhere is worse than an absent one.
 */
export function LandingFooter() {
  return (
    <footer className="mkt-sec-footer ground-ink bg-background text-muted-foreground">
      <div className="mx-auto max-w-[var(--grid-marketing)]">
        <div className="mkt-gap-footer flex flex-wrap border-b border-border pb-9">
          <div className="flex-[1_1_280px]">
            <div className="mb-3 flex items-center gap-[9px]">
              <span className="mkt-logo-mark block bg-primary" aria-hidden />
              <span className="mkt-logo-type text-foreground">CROWBAR</span>
            </div>
            <p className="mkt-item max-w-[34ch] leading-[1.5]">
              Operations for one venue at a time. Built with bars in Berlin,
              Lisbon and Kopenhagen.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading} className={column.basis}>
              <p className="type-label mb-3 text-text-on-ink-faint">
                {column.heading}
              </p>
              <div className="mkt-item flex flex-col gap-[9px]">
                {column.links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="hover:text-primary"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mkt-kicker flex flex-wrap justify-between gap-4 pt-[22px] tracking-[0.06em] normal-case text-text-on-ink-faint">
          <span>© {new Date().getFullYear()} Crowbar Systems GmbH · Berlin</span>
        </div>
      </div>
    </footer>
  );
}
