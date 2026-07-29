# Crowbar Product Design System

This is the durable design contract for Crowbar's current web experience.
Implementation details remain authoritative in `client/app/globals.css` and the
components named below.

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

## Current Intentional Page Shapes

The landing page is photography-led and uses:

- A parallax hero.
- A shared lager-to-dubbel panel behind two operational story sections.
- A five-card, right-anchored sticky feature deck on desktop.
- An accessible numbered FAQ.
- One night-theme CTA/footer with an inline contact form.

The staff overview is a figure-led operational mosaic. The schedule is a
three-day ledger with an inline calendar and booking-type legend, rather than
an hour-grid timeline.

The Floor workspace is an area-based host board: compact table cards are the
primary scan surface on desktop, with unassigned arrivals and walk-ins beside
them. On small screens the grids stack and operational actions open a sheet.
It deliberately does not simulate floor geometry or introduce drag-and-drop
until that later product decision is confirmed.

These shapes are not immutable, but replacing them is a product-design decision
that should preserve the token system, accessibility contract, responsive
behavior, and functional data/actions.

## Known Content and Functionality Gaps

- Landing FAQ copy in `client/app/page.tsx` is draft marketing copy and needs
  owner review before publication.
- `ContactDialog` and `FooterContactForm` currently simulate success locally;
  neither delivers a message to a backend or provider.

These gaps belong in `docs/TODO.md` until resolved.
