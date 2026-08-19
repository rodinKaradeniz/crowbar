---
name: frontend-design
description: Enforces Crowbar's committed design language when building or changing UI in this repo. Use when adding pages, components, dialogs, sheets, or visual states to client/. Produces UI that reads as native to the existing app — SRM taproom tokens, Radix/shadcn primitives, figure-first operational hierarchy, mandatory module-disabled and empty states. For greenfield design work outside this repo, use a generic design skill instead.
---

# Frontend Design (Crowbar)

Crowbar's aesthetic direction is **already committed**. Do not pick a new one.
`docs/DESIGN.md` is the authority; this skill is how you apply it while writing
components. When the two disagree, DESIGN.md wins and you update this skill.

The job is to make new UI indistinguishable from UI that was always here.

## Service context — read this before laying anything out

Staff surfaces are used **one-handed, mid-service, on a phone, standing up,
with interruptions**. That is the design constraint that outranks elegance:

- The primary action on a staff screen is reachable with a thumb and is not the
  smallest target on the page.
- A task interrupted halfway must survive. Do not build multi-step flows that
  lose state when the host walks away and comes back.
- The screen answers "what do I do next" in one glance — figures and status,
  not paragraphs.
- Destructive or irreversible actions get confirmation, because a mistap during
  a rush is the normal case, not the edge case.

Guest surfaces (`/reserve`, `/queue`, `/menu`, `/order`) are the opposite
context: one-off, unfamiliar, often on a poor connection. Optimize them for
clarity on first read.

## The committed direction

- **Palette:** the warm SRM taproom scale — `pilsner` and `foam` as light
  grounds, `lager` → `marzen` → `dubbel` as the ordered gold-to-amber accent
  range, `porter` as the dark ground, `brass` for rules and dot leaders,
  `oxblood` for destructive. Tokens live in `client/app/globals.css`. The
  retired green palette does not come back.
- **Type:** Libre Caslon Text is the display face (`--font-display-face`, used
  by `.page-title` / `.page-title-lg` / `.page-title-xl`); Hanken Grotesk is
  the body face; Spline Sans Mono carries operational figures, prices, counts,
  and times via `.figures`. All three are wired in `client/app/layout.tsx`.
- **Primitives:** Radix + shadcn/ui with Tailwind 4, in
  `client/components/ui/` (button, dialog, sheet, popover, select, table, tabs,
  card, sidebar, chart, calendar, command, …). Reuse these before writing a new
  primitive.
- **Themes:** one dark visual language, two entry points. `.theme-night` is
  forced on public guest pages by `client/components/night-theme.tsx`; `.dark`
  is the staff-dashboard preference owned by
  `client/components/staff-theme.tsx`, persisted as `crowbar-staff-theme` and
  applied before hydration so there is no light flash. Both read the same warm
  dark token block — do not introduce a second dark-mode concept.
- **Shared motifs:** `.page-container` / `.page-pad` for page roots,
  `.page-title` for dashboard headings, `.leader-dots` for paired
  name/value rows (menu lines, totals, hours), plus `.eyebrow`,
  `.rule-double`, `.coaster`, `.glow-pulse`, and `.fade-rise`. Reach for these
  before inventing an equivalent.
- **Charts:** `var(--chart-1)` through `var(--chart-5)`. Service-type colors are
  tenant data and are never replaced by chart tokens.

Operational hierarchy is **figure-first**: numbers and charts dominate, chrome
recedes, labels stay short. Do not put explanatory prose next to a figure when
a label or accessible description does the job.

## Rules

1. **Tokens, never hex.** No literal colors and no arbitrary Tailwind values
   (`bg-[#f4f1ea]`) where a semantic token exists. If a genuinely new tone is
   needed, derive it inside the existing SRM ordering and name it semantically
   in `globals.css`.

2. **Every staff surface needs a module-disabled state.** Subscribable features
   are gated on the backend route *and* the staff page. Render
   `client/components/module-disabled.tsx` — do not invent a second "not
   enabled" treatment, and do not let a disabled module render an empty
   dashboard that looks broken.

3. **Every collection needs an empty state.** Use
   `client/components/empty-state.tsx` with an honest title, and only an action
   the user can actually complete. A blank panel is a bug report waiting to
   happen. Never fake data to avoid designing this.

4. **Format through the canonical helpers, never raw values.** Money goes
   through `client/lib/money.ts` (`formatMoney`, `toMoney`); dates and times go
   through `client/lib/business-time.ts` (`formatBusinessTime`,
   `formatBusinessDate`, `formatBusinessDateTime`) with the **business
   timezone**, not the browser's; quantities go through `client/lib/units.ts`
   (`bottle` and `keg` are milliliters — never special-case one of them).
   Tenant country, currency, locale, timezone, and tax label come from
   `client/contexts/regional-context.tsx`; do not hard-code EUR, `de-DE`, or
   `Europe/Berlin` into a reusable component.

5. **Accessible interaction patterns replaced the browser dialogs.**
   Destructive product actions use
   `client/components/confirmation-dialog.tsx`. Native `alert()` and
   `confirm()` were deliberately removed in Stage 1 and must not return. Keep
   semantic controls, labels, visible focus, keyboard operation, correct ARIA
   state, and legible contrast.

6. **Server Components by default.** `"use client"` only at genuinely
   interactive boundaries; authenticated initial data is fetched server-side.

7. **Motion is restrained and reversible.** Scroll-linked effects update refs
   rather than React state per frame, and everything becomes static under
   `prefers-reduced-motion`. Reuse `.fade-rise` / `.glow-pulse` before adding
   keyframes.

8. **Mobile may simplify, not omit.** A layout can degrade a desktop
   interaction into a plain list or a sheet (Floor does exactly this), but the
   underlying action must remain reachable.

## Copy rules that are not negotiable

Settlement copy is **Settle externally** / **Settled externally**. Never
"payment successful", card-terminal imagery, receipt or fiscal language, or any
cue implying Crowbar moved money. Never label uncollected order totals
"revenue". `write-crowbar-operational-copy` owns this in full — load it when
writing user-facing strings.

## When NOT to use

- Design work outside this repository.
- Pure logic, data, or API changes with no visual surface.

## Anti-patterns

- Introducing new fonts, palettes, or a "bolder direction" — that decision is
  closed.
- Bespoke modal/menu/table implementations when `components/ui/` has one.
- Inline hex or arbitrary Tailwind values where a token exists.
- Rendering a raw `Date`, a raw currency number, or a browser-local time.
- Shipping the happy path with no empty state and no module-disabled state.
- A confirmation-free destructive action, or a native `confirm()`.
- Prose padding around an operational figure.
- Simulating a capability that does not exist yet. The MVP hides unsupported
  states rather than faking them (`docs/HISTORY.md`, 2026-08-14).

## Verifying

```bash
cd client && npm run lint && npm run test:run && npm run build
```

Run `npm run build` whenever routing, server/client boundaries, or config could
be affected. Drive the surface in `./scripts/dev.sh` at a phone width before
claiming a staff screen works.

## Reference

`docs/DESIGN.md` (authority), `client/app/globals.css` (tokens and utilities),
`docs/PRODUCT.md` (vocabulary and what must not be implied),
`docs/TODO.md` (known content gaps — the landing FAQ copy is still draft).
