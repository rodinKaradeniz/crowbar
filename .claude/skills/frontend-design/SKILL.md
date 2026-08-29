---
name: frontend-design
description: Applies Crowbar's committed design contract when building or changing UI in this repo — rule zero (the token block), the three-tier severity rank and its qualification test, the primitive set, the six mandatory states, the two grounds, and the canonical formatting and copy rules. Use when adding pages, components, dialogs, sheets, or visual states to client/. Composes with user-level design and taste skills: they own craft within the system, this skill owns what must stay true in this codebase.
---

# Frontend Design (Crowbar)

`docs/DESIGN.md` is the authority; this skill is how you apply it while writing
components. When the two disagree, DESIGN.md wins and you update this skill.

**The aesthetic direction is settled.** The system is the locked Claude Design
deliverable *Crowbar UI color and severity system*, rev 3, after three review
passes. Stage 7 promoted `DESIGN.md` from a description of what exists into the
committed contract, and this is that contract. Changing palette, type scale,
density or motion is now a change to a settled system — argued, then landed in
the token layer and `DESIGN.md` together, in one pass. It is never adopted by
one component diverging from the rest.

The job is to make new UI indistinguishable from UI that was always here.

## Rule zero, before anything else

The `:root` block in `client/app/globals.css` is the only source of truth.

> No colour, size, spacing value, radius or duration may enter the codebase
> that is not declared in it. A raw hex, a magic px, an ad-hoc easing: all
> three are bugs.

**A value that is needed and missing is a design question to raise, not an
implementation choice.** Say so and stop; do not derive one that looks close.

## The severity rank — the part that is easy to get wrong

This is a semantic system, not a palette. It decides what a manager looks at
first during service. A misapplied tier makes the product worse at its job than
no colour at all, so this is the highest-risk thing you can touch.

**The test, and nothing else picks the level:**

> What does a bartender do about it, and when?

Do not answer it by hand — the rank is encoded in `client/lib/severity.ts`.
Call it. Add a derivation there, with its reasoning, rather than classifying
inside a component.

- **critical** — act now, this shift. Exhaustively: a ticket past its target
  time, a guest waiting past the time they were quoted, a live board that has
  lost its connection, a device that cannot send orders. Plus: a thing that is
  broken right now (failed sign-in, dead link, a request that will not
  complete).
- **attend** — before the night ends, not in the next two minutes: a party with
  no table assigned, a tab open past close, an item that will run out during
  service, a ticket approaching target, a booking running late.
- **neutral** — **the default**. Par levels, ordering, forecasts, variance,
  counts, comparisons. Weight and position carry it; it gets no hue.

**Never critical:** stock, money, next week, or a number being lower than
someone hoped. A busy night is not critical. Three reds on one screen is
already a lot; a fourth means the rank is being abused.

**Never attend:** par levels and ordering.

**If it does not clearly qualify, it is neutral.**

Two rules that constrain layout, not just colour:

1. **Severity describes the item, never the control that resolves it.** A late
   ticket gets a red rail, a red badge and a red timer — and a standard primary
   "Served".
2. **Attend is subordinate.** Never above a critical item in a list, never a
   full row background.

Off the ladder entirely: **form validation** (`--field-invalid` on paper,
`--field-invalid-ink` on ink — never a severity token) and **brand** (identity,
primary action, active nav, live-and-healthy — green never means "good news
about a number").

Colour is never the sole carrier of meaning: pair every tone with a word.

## Grounds

Two, fixed by surface, never a preference: `paper` for landing, auth and public
guest surfaces; `ink` (`.ground-ink`, set on `<html>`) for the staff product.
Semantic roles (`--background`, `--muted-foreground`, `--critical-text`, …)
re-resolve per ground, so a component almost never needs to know which one it
is on. Do not reintroduce a dark-mode toggle; `.dark` is retired and inert.

## Service context — read this before laying anything out

Staff surfaces are used **mid-service, in low light, by someone being spoken
to**. That constraint outranks elegance:

- The primary action is reachable without aiming and is not the smallest target
  on the page. On tablet it sits bottom-right, inside the arc of a thumb.
- A task interrupted halfway must survive.
- The screen answers "what do I do next" in one glance — figures and status,
  not paragraphs.
- Destructive or irreversible actions confirm, because a mistap during a rush
  is the normal case.
- **Nothing depends on hover.**

Guest surfaces (`/reserve`, `/queue`, `/menu`, `/order`) are the opposite: one
-off, unfamiliar, often on a poor connection. Optimise for clarity on first
read.

## Rules

1. **Tokens, never hex.** No literal colours, no arbitrary Tailwind values
   (`bg-[#f4f1ea]`, `p-[13px]`) where a token exists. A new tone is a design
   question, not a call-site decision. Prefer a canonical utility
   (`text-text-muted`) over `text-[var(--text-muted)]` — if the token is not in
   the `@theme` bridge in `globals.css` and you need it, add it there.

   The **marketing and auth surfaces** are the one exception, and a bounded one:
   the Landing and Auth canvases set fluid sizes that sit between the ten
   declared type steps. Those live transcribed in the `.mkt-*` / `.auth-*` layer
   of `globals.css`, never inline. Product surfaces never use those classes.

2. **Reuse the primitives.** `client/components/ui/` holds the implementation
   of §06 — button, input, label, badge, table, figure, sheet (side panel),
   dialog, skeleton. Each carries its spec in a header comment. Do not write a
   second status object: the **badge is the only one**, and there are no dots
   in nav, no coloured pills, no icon badges.

3. **All six states, every data surface.** Loading, empty, module-disabled,
   permission-denied, error, offline. A surface missing any is unfinished. Use
   `empty-state.tsx`, `module-disabled.tsx`, `role-restricted.tsx` — and keep
   module-disabled and permission-denied distinct, because "your venue has not
   bought this" and "your job does not include this" are different answers.

4. **Honest emptiness.** Empty figures are **em-dashes, never zeroes** — a zero
   is a claim about a night that has not happened. Never fake data to avoid
   designing an empty state. Never simulate a capability that does not exist;
   the MVP hides unsupported states rather than faking them.

   This extends to **copy, including marketing copy**: a page may not claim a
   capability the product lacks. It is the same rule as the settlement
   vocabulary, applied to features, and it outranks the canvas. When the design
   shows a state the backend cannot supply — a countdown, a count, an
   "attempts remaining" — ship the surface without it and record the gap in
   `docs/TODO.md` §7a. Several landing and auth strings were corrected on
   exactly this ground; do not restore them from the canvas.

5. **Format through the canonical helpers.** Money via `client/lib/money.ts`;
   dates and times via `client/lib/business-time.ts` with the **business
   timezone**, not the browser's; quantities via `client/lib/units.ts`
   (`bottle` and `keg` are milliliters). Tenant country, currency, locale,
   timezone and tax label come from `client/contexts/regional-context.tsx`. Do
   not hard-code EUR, `de-DE` or `Europe/Berlin` into a reusable component —
   the German formatting the design shows is *output*, not a literal.

6. **Server Components by default.** `"use client"` only at genuinely
   interactive boundaries; authenticated initial data is fetched server-side.

7. **Motion is the declared five, and nothing else.** 120ms hover/press, 180ms
   enter, 2s live pulse, 1.4s skeleton breathe, 2s offline alarm. All off under
   `prefers-reduced-motion`. Scroll-linked effects update refs, not state.

8. **Two targets, not three.** Desktop 1280+ with the 228px rail; tablet
   1024×768 with bottom-bar nav and a **48px floor on every control**. There is
   no phone design — if a task needs one, that is a design question.

9. **Destructive actions are placed, not just styled.** Never adjacent to a
   frequent action, and always confirmed via
   `client/components/confirmation-dialog.tsx`. Native `alert()`/`confirm()`
   were removed in Stage 1 and must not return.

## Copy rules that are not negotiable

Settlement copy is **Settle externally** / **Settled externally**. Never
"payment successful", card-terminal or receipt imagery, fiscal language, or any
cue implying Crowbar moved money — and **no green success-tick pattern**. Never
label an uncollected order total "revenue"; money the venue took is **sales
value**, the dashboard figure is **ordered today**.

Staff roles are `owner`, `manager`, `host_server` ("Host / server"),
`bar_kitchen` ("Bar / kitchen"), `inventory_operator` — never an invented set,
including in marketing copy.

`write-crowbar-operational-copy` owns this in full — load it when writing
user-facing strings. It and `docs/RULES.md` / `docs/PRODUCT.md` outrank every
skill, including this one.

## Composing with user-level design skills

User-level skills under `~/.claude/skills/` are in scope and are not overridden
by this file.

| They own | This skill owns |
| --- | --- |
| Layout and hierarchy craft within the system, composition, information design, accessibility and performance review, component API shape | Rule zero, the severity rank, the primitive set, the state coverage that cannot be skipped, the canonical formatting helpers, the tenancy/module gate, and the compliance copy |

What changed with stage 7: they no longer own *aesthetic direction*. The
palette, type scale, spacing, radius, elevation and motion are settled. They
own how well a screen is composed inside those constraints.

## Anti-patterns

- Inventing a colour, size or duration because the token block lacks one.
- Classifying a severity inside a component instead of in `lib/severity.ts`.
- Red on a declining figure, on below-par stock, or on a count variance.
- A severity-coloured button on the item it resolves.
- A second status object — a dot, a pill, a chip.
- Bespoke modal/menu/table implementations when `components/ui/` has one.
- Rendering a raw `Date`, a raw currency number, or a browser-local time.
- A zero where nothing has happened yet.
- Shipping the happy path with no empty and no module-disabled state.
- Reintroducing a dark-mode toggle, or a second dark concept.
- Prose padding around an operational figure.
- Copying a claim out of a canvas without checking the backend supports it.
- A disabled control drawn as a faded version of the enabled one.

## Verifying

```bash
cd client
npm run lint && npm run test:run && npm run build

# Rule zero — the check that proves the system held rather than drifted.
grep -rEn "#[0-9a-fA-F]{3,8}\b" --include="*.tsx" --include="*.ts" --include="*.css" \
  app components lib contexts hooks | grep -v "app/globals.css"
```

Every surviving hit must be one of the four named categories in
`docs/DESIGN.md` under *Rule zero* — held Insights chart series, tenant-chosen
service-type colours, Recharts attribute selectors, or the `#000000` placeholder
in the colour picker. **Anything else has drifted.** Do not add a fifth
category; raise it as a design question instead.

Drive the surface in `./scripts/dev.sh` at **1280 and at 1024×768** before
claiming a staff screen works.

## When NOT to use

- Design work in another repository, where only the user-level design skills
  apply.
- Pure logic, data, or API changes with no visual surface.

## Reference

`docs/DESIGN.md` (authority) · `client/app/globals.css` (tokens) ·
`client/lib/severity.ts` (the rank as a procedure) ·
`client/components/ui/` (the primitives, each with its spec) ·
`docs/PRODUCT.md` (vocabulary and what must not be implied) ·
`docs/TODO.md` (backend gaps the design assumes).
