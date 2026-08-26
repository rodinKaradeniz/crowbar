# Crowbar Product Design System

This is the durable design contract for Crowbar's current web experience.
Implementation details remain authoritative in `client/app/globals.css` and the
components named below.

**Status:** this file currently *describes* what the interface already does.
`TODO.md` stage 7 promotes it into a committed contract — a settled token set,
type scale, spacing, density, operational status treatment, state coverage, and
breakpoints that every surface derives from, and that stage 11's mobile client
reuses. Until then, treat it as the floor: do not contradict it, and do not
assume it is complete.

Because stage 7 is the pass that settles the direction rather than applies a
settled one, the visual identity below is **the current baseline, not a closed
decision**. A design or taste skill — including a user-level one — may propose
a different palette, type scale, density, or motion language, and stage 7 is
where that argument belongs. A proposal is adopted by changing the token values
in `client/app/globals.css` and this file together, in one pass. It is never
adopted by one component diverging from the rest; two design languages running
at once is the outcome stage 7 exists to prevent.

## Visual Identity

Crowbar uses a warm taproom palette based on the SRM beer-color scale:

- `pilsner` and `foam` are the light grounds.
- `lager`, `marzen`, and `dubbel` form the ordered gold-to-amber accent range.
- `porter` is the dark ground.
- `brass` is used for rules and dot leaders.
- `oxblood` is destructive.

Use the named CSS tokens and utilities from `client/app/globals.css`. Do not
reintroduce the retired green palette or add isolated hex colors when a semantic
token exists. If a new intermediate brand tone is necessary, derive it within
the existing SRM ordering.

There is one dark visual language with two entry points:

- `.theme-night` is forced on public guest pages.
- `.dark` is the staff-dashboard preference.

Both use the same warm dark token block. The dashboard preference is managed by
`client/components/staff-theme.tsx`, persisted as
`crowbar-staff-theme`, and applied before hydration to avoid a light flash.

## Typography and Reusable Motifs

- Libre Caslon Text is the display face (`font-display`, `.page-title`).
- Hanken Grotesk is the body face.
- Spline Sans Mono is used for operational figures, prices, counts, and times
  (`.figures`).
- Dashboard page headings use `.page-title`; page roots use `.page-container`
  or `.page-pad`.
- `.leader-dots` is the signature row treatment for menu lines, totals, hours,
  and similar paired values.
- Reuse `.eyebrow`, `.rule-double`, `.coaster`, `.glow-pulse`, and
  `.fade-rise` before creating one-off equivalents.
- Charts use `var(--chart-1)` through `var(--chart-5)`. Service-type colors are
  tenant data and are not replaced by chart tokens.

Operational hierarchy is figure-first: numbers and charts dominate, chrome
recedes, and labels remain concise. Avoid explanatory prose beside a figure
when a short label or accessible description is sufficient.

## Interaction and Accessibility

- Scroll-linked effects update refs rather than React state on every frame.
- Motion becomes static under `prefers-reduced-motion`.
- Mobile layouts may deliberately simplify desktop interactions. For example,
  the landing feature deck is a normal sequential list below the medium
  breakpoint.
- Interactive controls retain semantic elements, keyboard operation, visible
  focus, labels, appropriate ARIA state, and legible contrast.
- Destructive product actions use the shared `ConfirmationDialog`, never the
  browser `confirm()` dialog.
- MVP settlement actions and status copy use **Settle externally** / **Settled
  externally**. Do not use card-terminal imagery, “payment successful,” fiscal
  receipt language, or other cues that imply Crowbar processed money.
- Money, date/time, tax, address, and phone presentation comes from tenant
  country/locale/currency/timezone configuration. The first pilot defaults to
  Germany, EUR, `de-DE`, and `Europe/Berlin`; do not hard-code those values into
  reusable components.

## Current Intentional Page Shapes

The landing page is photography-led and uses:

- A parallax hero.
- A shared lager-to-dubbel panel behind two operational story sections.
- A five-card, right-anchored sticky feature deck on desktop.
- An accessible numbered FAQ.
- One night-theme CTA/footer. The inline contact form was removed in stage 1
  and has no delivery path to reintroduce it through.

The staff overview is a figure-led operational mosaic. The schedule is a
three-day ledger with an inline calendar and booking-type legend, rather than
an hour-grid timeline.

The Floor workspace is an area-based host board: compact table cards are the
primary scan surface on desktop, with unassigned arrivals and walk-ins beside
them. On small screens the grids stack and operational actions open a sheet.
It deliberately does not simulate floor geometry or introduce drag-and-drop
for the MVP. The area-based shape is confirmed for the first supervised pilot;
geometry and drag-and-drop require later pilot evidence and a new decision.

These shapes are not immutable, but replacing them is a product-design decision
that should preserve the token system, accessibility contract, responsive
behavior, and functional data/actions.

## Known Content and Functionality Gaps

- Landing FAQ copy in `client/app/page.tsx` is draft marketing copy and needs
  owner review before publication.
- Contact forms, placeholder reviews, and pricing claims without authoritative
  workflows were removed in Stage 1. Reintroducing them requires real delivery,
  moderation, or approved commercial state plus honest failure handling.
- "ML Insights" is engineer-facing naming that operators do not use; stage 7
  owns the rename and the surrounding copy pass.
- The Reports workspace has a range picker driving every panel, but the
  Overview and Insights charts still render one fixed window with no
  time-range control.

These gaps belong in `docs/TODO.md` until resolved.
