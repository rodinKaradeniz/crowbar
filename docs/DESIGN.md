# Crowbar Product Design System

This is the committed design contract for Crowbar's web experience. It is the
authority: `client/app/globals.css` implements it, `.claude/skills/frontend-design`
applies it while writing components, and every surface derives from it rather
than inventing locally.

**Status:** settled. The system is the locked Claude Design deliverable
*Crowbar UI color and severity system*, rev 3, after three review passes. The
aesthetic direction is **no longer open** — `docs/TODO.md` stage 7 asked for
`DESIGN.md` to be promoted from a description of what exists into a committed
contract, and this is that promotion. A different palette, type scale, density
or motion language is now a change to a settled system, not a proposal against
an undecided one.

## Rule zero — the token block

The `:root` block at the head of [`client/app/globals.css`](../client/app/globals.css)
is the only source of truth.

> No colour, size, spacing value, radius or duration may enter the codebase
> that is not declared in it. A raw hex, a magic px, an ad-hoc easing: all
> three are bugs.

A value that is needed and missing is a **design question to raise**, not an
implementation choice. Open ones are listed at the bottom of this file.

The verification that proves the system held rather than drifted:

```bash
cd client
grep -rEn "#[0-9a-fA-F]{3,8}\b" --include="*.tsx" --include="*.ts" --include="*.css" \
  app components lib contexts hooks | grep -v "app/globals.css"
```

**Every hit that survives is one of three named things, and nothing else.** If a
hit does not fall into one of these, it is a bug:

| What | Where | Why it is there |
| --- | --- | --- |
| Library selectors | `components/ui/chart.tsx` | Attribute selectors matching hexes that Recharts itself emits (`stroke='#ccc'`). These are matched, never declared. |
| HTML numeric entities | e.g. `&#8599;` in `components/landing/closing-cta.tsx` | The regex cannot tell `#8599` from a hex colour. A character reference, not a value. |
| The declared series values | `lib/series-palette.ts` | The five `--series-*` values and the map from colours stored before the palette existed. A service-type colour is **tenant data** persisted as a string, and a CSS variable cannot be written to a database, so the values are duplicated here; `globals.css` remains the source of truth for rendering. |

This list was four entries before the categorical palette was declared. Held
Insights chart series, the twelve-hue tenant colour picker and its `#000000`
placeholder are all gone — see *Categorical series* below.

The grep above finds a colour. It does not find a **size**, and until the type
scale was bridged the codebase carried roughly 580 Tailwind size utilities the
token block never declared. `--text-xs`, `--text-sm` and `--text-base` are now
mapped to the Data, UI and Body steps in the `@theme` bridge; `text-lg`, `xl`,
`2xl`, `3xl` and `4xl` are deliberately left unmapped, because no declared step
sits at 18, 20, 24, 30 or 36px. They are the size equivalent of a raw hex:

```bash
grep -rEn "text-(lg|xl|2xl|3xl|4xl)\b" --include="*.tsx" app components
```

This one has a single allowed survivor: a prose comment in
`components/reports/report-shell.tsx` that *names* `text-2xl` while explaining
what was removed. The grep reads source, not markup, so a size discussed in a
comment looks identical to one applied to an element.

Anything else — a colour in a class, a fill, a style object — has drifted.

## The one idea

**The paper it replaces.** Ruled lines, ledger rows, a ticket rail. Radius
means "touch this". Elevation means "this is on top of the room". Colour is a
rank, not a mood.

## Grounds — paper by day, ink by night

Two grounds, **fixed by surface, never a user preference**:

| Ground | Where | Why |
| --- | --- | --- |
| `--paper` `#F6F4EE` | Landing, auth, public guest surfaces | The owner researches this at 2pm at a desk; a guest reads it once, unfamiliar, on a poor connection. |
| `--ink` `#14140F` | The staff product under `/business` | The staff use it at 1am in a room lit by candles. |

The auth screens are the hinge: an ink panel beside a paper form.

Implemented as `:root` (paper) and `.ground-ink`, set on `<html>` by the boot
script in `client/app/layout.tsx` so portalled dialogs, popovers and toasts
inherit it. The retired `.dark` / `.theme-night` toggle and the
`crowbar-staff-theme` preference were removed — see `docs/HISTORY.md`.

Ink is warm, not black: pure `#000` under white type flickers in venue light.

### The marketing page's band rhythm

The landing page runs on paper and is cut by bands. Which sections get a band
is a design decision, and it went wrong once in a way worth recording.

**A ground change ranks things.** The five numbered capabilities are a run of
five peers, and §03 was the only one on ink — so it read as a different KIND of
thing rather than the third of five. Meanwhile 01 and 02 were separated by
hairlines inside a shared section and 04 and 05 by nothing at all: three
different separators for one relationship.

The rule that came out of it: **within a run of peers, the separator is the
same device every time, and a ground change is not it.** All five are now
full-bleed bands with one padding (`.mkt-sec-feature`) and one opening rule
(`.mkt-band`), alternating down the declared paper ladder — `--paper`,
`--paper-tint`, `--paper-tint` is the whole vocabulary, and no new value was
needed. Alternating tint is a *rhythm*; ink against paper is a *rank*.

Two panels inside §03 stay on ink, and that is not an exception to the rule. The
bar board and the tab **are** the ink product, and the section is showing them —
so each carries `.ground-ink` and resolves every token against it, exactly as
`AuthPanel` does. Depicting the other ground is not the same as being on it.

The page's dark bands are now the night timeline (which narrates a shift in the
product) and the FAQ, neither of which is one of the five and neither of which
ranks anything.

## Severity is a rank — the load-bearing part of this system

This is not a palette decision. It decides what a manager looks at first during
service, and a misapplied tier makes the product worse at its job than no
colour at all.

**The test, and nothing else picks the level:**

> What does a bartender do about it, and when?

Encoded as a procedure in [`client/lib/severity.ts`](../client/lib/severity.ts).
Use it; do not re-derive a tier inside a component.

### The three tiers

| Tier | Qualifies | Tokens |
| --- | --- | --- |
| **Critical** — act now, this shift | Exhaustively: a ticket past its target time; a guest waiting past the time they were quoted; a live board that has lost its connection; a device that cannot send orders. Plus, from the Auth canvas, the same idea off the service floor: **a thing that is broken right now** — a failed sign-in, a dead link, a request that will not complete. | fill `--critical-fill` + `--critical-on-fill`; text `--critical-text` (resolves per ground) |
| **Attend** — before the night ends | A party with no table assigned; a tab still open past close; an item that will run out during service; a ticket approaching target; a booking running late. | fill `--attend-fill` + `--attend-on-fill`; text `--attend-text` |
| **Neutral** — **the default** | Par levels, ordering, forecasts, variance, counts, comparisons — anything whose deadline is a day away. Reads through weight, position and the hairline badge. | none |

**Does not qualify as critical:** stock, money, next week, or a number being
lower than someone hoped. A busy night is not critical. Three reds on one
screen is already a lot; a fourth means the rank is being abused.

**Does not qualify as attend:** par levels and ordering, ever.

**If a state does not clearly qualify, it is neutral.**

### Two channels that are not on the ladder

- **Form validation.** Inline field errors, invalid input, required-field
  messages — anything the person can fix in the field they are standing in.
  `--field-invalid` on paper, `--field-invalid-ink` on ink and surface. It
  never borrows a severity token. *"Too short — 12 characters minimum"* is
  this, not attend: a password-length hint is not a service item to be handled
  before the night ends.
- **Brand.** Identity, the primary action, the active nav item, and
  live-and-healthy. Green never means "good news about a number". If green ever
  reads that way, it has been misused.

### Categorical series — identity, not rank

Charts and tenant-chosen service-type colours needed a colour that is neither a
severity nor brand. `--series-1..5` are that set, and they close what were open
questions 1 and 2.

| Slot | Value | Name |
| --- | --- | --- |
| `--series-1` | `#0A9C95` | Teal |
| `--series-2` | `#6A69BF` | Periwinkle |
| `--series-3` | `#967A23` | Ochre |
| `--series-4` | `#A85386` | Plum |
| `--series-5` | `#2291E0` | Blue |

Five things about them are load-bearing:

1. **Five, not twelve.** Three sectors of the wheel are reserved — critical
   (hue ~30), attend (~66) and brand green (~160) — and five is the largest set
   that still clears the normal-vision separation floor once those are removed.
   A sixth is not a generated hue; it folds into "Other". The tenant picker's
   old twelve arbitrary hues could not pass: several sat close enough to the
   severity fills to read as an alarm beside a real one.
2. **One value per slot, both grounds.** Unlike severity, which needs a paper
   pair and an ink pair, these sit in the lightness band where a single value
   clears paper, ink and the panel surface.
3. **Marks, not text.** Contrast is ≥ 3:1 against every ground — the
   graphical-object floor, not the 4.5:1 text floor. Text beside a series wears
   a text token; the swatch carries the identity.
4. **Always labelled.** Colour is never the sole carrier, exactly as for
   severity. The nearest rank colour is series-3 to `--attend-fill` at ΔE 12.6,
   which is why the name is never optional.
5. **Reached through `lib/series-palette.ts`.** No call site handles a literal.
   A colour stored before the palette existed resolves to its nearest slot; an
   unrecognised one falls back to the muted token rather than painting a hue
   the system never declared.

Verified with the dataviz validator against `#F6F4EE`, `#14140F` and `#1B1B14`:
lightness band, chroma floor, CVD separation, normal-vision floor and contrast
all pass on all three. Worst adjacent pair is series-2/series-1 at ΔE 12.9
deutan, 18.4 normal.

### Two rules that constrain layout, not just colour

1. **Severity describes the item, never the control that resolves it.** A late
   ticket gets a red rail, a red badge and a red timer — and a *standard
   primary* "Served".
2. **Attend is always subordinate.** It never sits above a critical item in a
   list, and it never fills a whole row background.

### Where each level may appear

| Surface | Allowed |
| --- | --- |
| Nav badge | all three |
| 2px inset bar on a row | critical only |
| Tinted row / tile background | critical & attend |
| A figure turning colour | critical only |
| Persistent header bar | critical only |

A severity colour is **always paired with a word**. Colour is never the sole
carrier of meaning.

### Classification of Crowbar's actual operational states

The rank applied to the states this product really has. Derived during the
stage 7 audit of 170 red/amber call sites; the reasoning lives in
`client/lib/severity.ts` so it is not re-litigated per file.

| State | Tier | Note |
| --- | --- | --- |
| Live board lost its connection | **critical** | The only one of the four exhaustive critical cases this codebase can currently derive. An **upgrade**: the ticket board and tabs rendered this in amber, which understated it. |
| Failed load / dead link / failed sign-in | **critical** | "A thing that is broken now." Always with a retry or a route out. |
| Tab still open past service-day close | attend | Cutoff from the business's own service day, not browser midnight. |
| Party with no table assigned | attend | |
| Booking running late | attend | |
| Guest notification (queue "table ready") failed to send | attend | The guest is waiting and will not be told — but it is not one of the four critical cases, and the default when a state does not clearly qualify is the lower tier. |
| Ticket age | **neutral** | Target time is not derivable — see Backend gaps. |
| Queue wait | **neutral** | Quote-at-join is not stored — see Backend gaps. |
| Stock below par | **neutral** | §08 names par levels neutral twice. Next week's problem, on the same night. |
| Count variance | neutral | Money-shaped and a day away. |
| A figure that moved down | neutral | The named non-qualifying case. Rendering a month-over-month decline in red is the most common way this rank gets abused. |
| Table state (free / seated / reserved / cleaning / out of service) | neutral | Workflow position. Seated tables carry a brand bar, not a hue. |
| Order status (received / preparing / ready / served) | neutral | Workflow position. |
| Guest dietary or allergy note | neutral | The Dashboard canvas shows "Note · shellfish" as plain neutral text. |
| Guest segment (Champions, At Risk…) | neutral | A visit frequency has no deadline at all. Was five coloured pills on two screens. |
| Staff role | neutral | A job title is a fact, not a rank. Was five more coloured pills. |
| Purchase-order stage | neutral | §08 names ordering as one of two things that **never** qualify as attend. |
| Stock movement (receive / waste / adjust) | neutral | A record of something that already happened. Green for "stock arrived" is the success-tick pattern this system does not have. |
| Ordering paused by a manager | neutral | A deliberate setting is not a failure. Loud by position and weight. |
| Stock record that disagrees with itself | critical **text**, no fill | A defect in the book. Stated plainly; nothing to do in the next five minutes. |
| Model fit statistic / cancellation-risk score | neutral | A forecast about next week does not outrank a late ticket. |
| Notification origin (staff / guest) | neutral | Was eight icons across five hues. |

## Type

Archivo (display) · Instrument Sans (UI) · IBM Plex Mono (data). All three are
SIL OFL 1.1, wired through `next/font/google` in `client/app/layout.tsx`, which
self-hosts the woff2 at build time — that is how the "no third-party font CDN
at request time" requirement is met. Do not hand-roll `@font-face`. Every
family keeps a declared fallback stack.

Ten steps, 92px down to 9.5px — a 9.7× range, set optically: each step up loses
tracking, so a 92px headline and a 21px title look equally tight. Use the
`.type-*` classes in `globals.css`.

| Step | Spec | Use |
| --- | --- | --- |
| D1 | Archivo 800 · 92 / .94 / −.038 | Hero |
| D2 | Archivo 800 · 60 / 1 / −.036 | Section & figure |
| D3 | Archivo 700 · 32 / 1.05 / −.028 | Capability heading |
| T1 | Archivo 700 · 21 / 1.15 / −.026 | Screen title, panel title |
| T2 | Archivo 700 · 16 / 1.25 / −.02 | Panel header in the product |
| Body | Instrument Sans · 16 / 1.5 | Marketing prose, long-form |
| UI | Instrument Sans · 14 / 1.45 | Table cells, nav, buttons — desktop default; 15–17 on tablet |
| Data | Plex Mono · 13.5 / 1.4 | Figures, prices, counts, times |
| Label | Plex Mono 500 · 10.5 / .14em caps | Field label, badge, eyebrow |
| Micro | Plex Mono 500 · 9.5 / .16em caps | Table head, nav group — in-product only |

`font-variant-numeric: tabular-nums` is set once on `body` and inherited.

### The marketing layer

Marketing is the one surface that interpolates rather than steps. It renders on
a phone in a kitchen and a 27" display in an office, so the Landing canvas sets
its own fluid scale: 31 distinct `clamp()` expressions plus editorial sizes
(14.5, 15.5, 16.5, 19, 20, 22px) that sit *between* the ten declared steps.

Those values are transcribed verbatim into a `.mkt-*` layer in `globals.css` —
never inlined in a component — so the marketing scale is reviewable in one place
and nothing enters the codebase that the design did not set. **Product surfaces
never use `.mkt-*`.** They use `.type-*` and the `--space-*` tokens.

The same layer holds the auth measurements (`.auth-*`), for the same reason:
the paddings, the form rhythm (`.auth-field`, `.auth-field-end`, `.auth-hint`,
`.auth-heading`) and the two auth control sizes (`.auth-cta`,
`.auth-inline-link`). Register is the tallest form in the product and has to fit
a 1280x800 laptop without scrolling, so its whole vertical budget is reviewable
in one place rather than spread across per-component margins.

**The 48px auth field height is not part of that budget.** It is both the Input
spec and `--control-tablet-min` exactly; trimming it would break every auth
control on the 1024x768 target.

This is the one place where sizes live outside `:root`, and it is recorded as an
open question in `docs/TODO.md` §7b rather than treated as settled.

## Space, radius, elevation, targets

Base 4, **named by role and not applied uniformly**: 4 icon-to-label · 8 inside
a badge · 12 table cell gap · 16 panel padding · 24 block separation · 32
content gutter · 48 section break (product) · 96 section break (marketing).

**A radius means you can act on it.** 0 surfaces and rows · 2 badges · 3
inputs, buttons, tiles · 4 overlays · 999 live dot, avatar. Structure stays
square, which is why nothing needs a shadow to look like a card.

**Elevation means "over the room".** E0 flat for every panel, table and row;
E1 (`--e1`) for dialogs, side panels, and the one floating action on tablet.
Tailwind's `shadow-sm`/`md` are mapped to E0 on purpose; only `shadow-lg` and
above carry E1.

| Target | Size |
| --- | --- |
| Desktop control | 34–44px |
| **Any** tablet control | **≥ 48px** (`--control-tablet-min`) |
| Tablet list row | 56–58px |
| Floor tile | 118px |
| Ticket clear bar | 60px |
| Bottom nav | 76px |
| Marketing header (`--mkt-header`) | 66px floor |
| Workspace topbar (`--workspace-header`) | 76px floor |

Both headers are sticky, so both are also a **scroll offset**: `--mkt-header`
sizes `scroll-margin-top` on every in-page anchor target (`.mkt-anchor`), and
`--workspace-header` is where every in-page sticky element in the workspace
begins. Each is a `min-height` floor on its own bar, never a fixed height.

**Nothing in the workspace may stick at `top-0`.** The topbar is already there.
An element that sticks at 0 pins itself to the viewport top, which is
*underneath* that bar, and silently loses its first 76px — and only once the
page is long enough to scroll, so it survives every review of a short one. Four
surfaces shipped with this defect before it was named: the docs nav (`top-0`,
fully hidden), the floor aside (`top-4`), and both preview columns on
profile/settings (`top-6`). The offset is always the token.

**There are two offsets, and the second one is measured.** A workspace page
also has its own pinned title bar (`components/page-header.tsx`), and its
height is not a constant — a page with sub-tabs is taller than one without,
actions wrap on a narrow screen, a description can run to two lines. Reports is
236px; Tabs is 81. So `PageHeader` measures itself with a `ResizeObserver` and
publishes `--page-header`, and anything that sticks *below* it offsets by
`calc(var(--workspace-header) + var(--page-header))`. `--page-header` is
declared `0px` so a sibling is merely flush before hydration, never overlapped.
A hard-coded second number would have been wrong on the first page that gained
a tab.

### Two page widths, decided by what the page is for

| | Width | Pages |
| --- | --- | --- |
| **Board** | full bleed | overview, floor, tickets, tabs, reservations, requests, queue, schedule, customers, inventory, insights, reports |
| **Document** | `--grid-workspace` (1024px), centred | menu, staff, all of `profile/*`, all of `settings/*`, guest profile |

Width is the working surface on a board: a floor map or a ticket wall on a
1920px monitor should use the monitor. A document is read and filled in, and a
1900px-wide text input is not a form anyone wants to complete — the same
argument as a measure in prose. `PageHeader`/`PageBody` take a `wide` prop and
apply this once; before it, exactly two pages had invented their own cap
(`menu` had `max-w-5xl mx-auto`, `region-tax` had `max-w-5xl` with no centring)
and the other 24 ran edge to edge.

Both halves carry the same gutter and the same measure so the title lines up
with the body under it. They are **siblings, not nested**: a `position: sticky`
element only sticks within its own parent's box, so a header inside the
scrolling body would stop sticking the moment that body scrolled past.

**Sub-navigation belongs in the pinned header, and it scrolls sideways.** Where
a page branches — Inventory's Stock/Counts/Suppliers, Reports' four panels —
the `TabsList` sits beside the title, so the branch you are on stays visible
above a table of rows that could otherwise belong to any screen in the product.
A five-entry `TabsList` is `w-fit` and measures 593px, so the slot is
`overflow-x-auto`: at 390px it scrolls rather than pushing the whole document
sideways.

`.mkt-shell` is the single containment primitive for marketing — max width,
centring and the one horizontal gutter. Full-bleed bands carry their background
on the `<section>` and their content in a `.mkt-shell` inside it; a band that
sets its own `padding-inline` will not share a left edge with the rest of the
page.

Destructive or shift-ending actions are never adjacent to a frequent one:
"Close the night" lives in the sidebar foot, diagonally opposite "Seat a
walk-in", and always confirms.

## Components

The primitive set in `client/components/ui/` is the implementation. Each file
carries its own spec in a header comment; the rules that matter across all of
them:

- **Button** — one primary signature everywhere: the accent fills it, deep
  green with paper text on paper, lit green with ink text on ink. Secondary is
  transparent with a hairline. `destructive` is critical-filled and belongs
  only inside a dialog or on a critical surface.
- **Input** — 48px auth / 40px product, radius 3, 13px inset. Label 10.5 mono
  uppercase **above**; never a floating placeholder. Focus is a deep-green
  border plus a 3px lit-green ring.
- **Badge** — the only status object in the system. Mono 10px, radius 2, 2/7
  padding, tabular. Filled critical, filled attend, or hairline. It carries a
  count or a two-word state. No dots in nav, no coloured pills, no icon badges,
  no second form anywhere.
- **Data table** — header 9.5 mono over a strong rule; rows 44px desktop / 56
  tablet; hairlines, **no zebra**. Text left, figures right and tabular. Hover
  lifts one step; selection is a 2px inset brand bar. Fixed column widths per
  screen so numbers align down the page.
- **Figure** — four weights (tablet 66 / headline 52–60 / panel 22–30 / in-table
  mono 13.5). Currency half-size and dimmed after the digits, German style. **A
  figure only takes colour when it is critical.** An empty figure is an
  em-dash, never a zero.
- **Side panel** — 400px, full height, right edge, E1, 180ms slide. Fixed
  structure: header → two-cell figure band → definition list → history →
  actions in a bordered footer. Full width under `--bp-panel` (440px).
- **Disabled** — flat, on every control: `--control-disabled` fill,
  `--control-disabled-foreground` text, a plain hairline border, no hover. Both
  tokens resolve per ground. Never a translucent version of the enabled
  control, which still reads as the primary action and invites the click.
- **Dialog** — 330–420px, radius 4, E1. **Only** for decisions that end a shift
  or cannot be undone. The title asks the real question with the real time in
  it; the body states the consequence in real numbers; the safe choice is the
  filled one; the risky choice is a quiet outline in red text.

## The six states — the build floor

**Every data surface ships all six. A surface missing any of them is
unfinished.**

| State | Component | Rule |
| --- | --- | --- |
| Loading | `ui/skeleton.tsx` | Skeletons mirror **the exact row rhythm they replace**, 1.4s breathe, staggered 100ms. Per-surface, not one generic block. |
| Empty | `empty-state.tsx` | A 26×2 brand rule, a title stating what is true, one sentence on how the space fills, two actions — one that sets it up, one that does it by hand. Empty figures are em-dashes. **No illustration, ever.** |
| Module-disabled | `module-disabled.tsx` | The nav entry is **removed, not greyed**. "Your venue has not bought this." |
| Permission-denied | `role-restricted.tsx` | "Your job does not include this." Deliberately a different answer from module-disabled — telling an operator the wrong one sends them to a settings page that cannot help. |
| Error | `app/error.tsx`, `dashboard-error-boundary.tsx` | Critical, with a retry. |
| Offline | `offline-bar.tsx` | A persistent 38px band at the top of the viewport carrying the time since last contact and a retry. **Never a toast. Never self-dismissing.** It is the one alarm in the system. The count of work held on the device is **omitted** — there is no offline outbox, and claiming one would be a lie about what is safe. |

## Motion

120ms for colour and border on hover and press; 180ms ease-out for anything
that enters; 2s pulse for live-and-healthy only; 1.4s breathe for skeletons;
2s slow flash on the offline bar. **Nothing else moves.**

Overlay enter and exit are four keyframes in `globals.css`, driven by the
`data-state` attributes Radix already sets: in on `--dur-enter` /
`--ease-enter`, out on `--dur-press`. Getting out of the way should not be a
performance. This replaced `tw-animate-css`, which carried its own durations
and easings — values the token block does not declare.

**One addition, and it is the marketing page only.** *Settle* — the intro on
the landing page: opacity plus a 10px rise (`--settle-rise`), nothing that
scales, rotates, blurs or parallaxes, staggered only among siblings inside one
section.

It is driven by **view progress, not a clock** — `animation-timeline: view()`
over `--settle-span`, offset per sibling by `--settle-stagger` — which is what
makes it safe on a statically prerendered page. There is no JavaScript, no
client boundary and no hydration gate; nothing is hidden by a base rule, so
above-the-fold content paints complete and the page is fully readable with
JavaScript disabled. Because a scroll-driven animation has no millisecond
duration, none is declared: the range is the duration.

Where `animation-timeline` is unsupported the `@supports` block does not apply
and there is simply no motion. That static fallback is deliberate — it is a
better answer than a scroll library, which costs a dependency and a permanent
rAF loop, fights the tablet target, and breaks browser scroll restoration.

Smooth in-page scrolling is scoped to `html:not(.ground-ink)` — marketing, auth
and the public guest pages. The product is excluded because it scrolls elements
into view programmatically, and smoothing that would be a regression.

All motion is off under `prefers-reduced-motion`, including `scroll-behavior`,
which is neither an animation nor a transition and needs its own rule.

## Print — one surface, and the two rules it needed

There is exactly one print stylesheet in the product, at the foot of
`globals.css`, and it exists for `/business/floor/qr-sheet` — the sheet a venue
prints once and cuts up so every table carries its own guest-ordering code.
Nothing else in the product is designed to be printed, and adding a second print
surface is a design question, not a call-site decision.

**A staff route that runs on paper.** Grounds are fixed by surface and the staff
product is ink — but ink is a decision about a room lit by candles at 1am, not
about a sheet of A4. Printing the product ground would push a black page through
the venue's printer. The sheet therefore carries `.ground-paper`, which is
**declared as the same block as `:root`** rather than as a copy of it:

```css
:root,
.ground-paper {
  --background: var(--paper);
  …
}
```

That is one selector, no duplicated role mappings, and no way for the two
grounds to drift apart. It is also the exact mirror of what the landing page
already does in the other direction — `.ground-ink` on a subtree inside paper,
in `ordering-section.tsx` and `auth-shell.tsx`. On screen the sheet reads as a
paper document lying on the ink workspace, which is what it is.

`<Ground ground="paper" />` does **not** work here and should not be reached
for: child effects run before parent effects, so the ink `Ground` in
`app/business/layout.tsx` re-adds the class on every hard load.

**Physical units, and why rule zero did not need an exception.** The sheet is
the first surface in the system that needs millimetres — a page margin and a QR
size are physical facts about paper, not screen values. Three tokens are
declared with every other value, in their own group at the end of the `:root`
block:

| Token | Value | What it is |
| --- | --- | --- |
| `--print-page-margin` | `12mm` | every edge of the sheet |
| `--print-qr-size` | `34mm` | the drawn code, edge to edge |
| `--print-card-gap` | `6mm` | the scissor line between cards |

The reason this looked like it needed an exception is that the margin is
consumed inside `@page`, which is not an element and was assumed unable to
resolve a custom property. **That was measured rather than assumed, and it is
false in a current engine.** In Chrome 152, `@page { margin: var(--pm) }` with
`--pm: 40mm` and a literal `40mm` produce byte-identical five-page PDFs, and
`5mm` produces a four-page one both ways. So the value is declared like every
other value and read with `var()`. An engine that does not substitute falls back
to its own default margin — a differently spaced sheet, not a broken one.

A card's **width** is deliberately not a token: the sheet is a three-column grid
dividing the printable width, so the column count is the decision and the card
size follows from the paper. `--print-qr-size` is a token because a code's
scannability is a physical property that follows from nothing else.

**Chrome is hidden by one attribute.** The rail, the topbar, the tablet bottom
bar and its floating action, and `PageHeader` all carry `data-print-hide`, and
the print block names that one selector rather than reaching into five
components by class. `PageHeader` carries it unconditionally, which is also how
the Print button hides — a sheet with a button printed on it is a sheet someone
has to print again.

## Responsive

Two **designed** targets, and a floor under everything narrower.

The two designed targets are desktop and the 1024×768 tablet. They are what the
canvases draw, and they are where every layout decision is made. Below them
`--bp-phone: 640px` is a **floor, not a third target** — it keeps a surface
usable on a phone; it does not claim a phone was designed for.

**The floor now covers the product too, and that reverses a rule this document
carried for one day.** It previously read "nothing in `app/business/*` may use
it". That held while the workspace was only ever opened on a laptop or a tablet,
and stopped holding the moment anyone opened it on a phone: the header wrapped
to two lines, the tablet's five-slot bottom bar became five 78px slots, and the
overview showed two figures of four with no way to reach the others. None of
that is a design question — it is a surface that does not work, and the answer
is not a design canvas but the same floor the marketing page already had.

**What has not changed:** the phone is still not a designed target, the tablet
canvas still rules the tablet range, and the staff phone answer is still a React
Native client in stage 11. `phone:` in `app/business/*` may make a surface
usable at 390px; it may not invent a phone layout, and it may not move anything
inside the tablet range. Stage 7's exit gate once required a phone-capable staff
surface and never met it; that clause sits in `docs/TODO.md` stage 11.

| | Desktop | Tablet | Phone (floor) |
| --- | --- | --- | --- |
| Width | ≥ `--bp-desktop` (1280) | 640–1279, drawn at 1024×768 | < `--bp-phone` (640) |
| Navigation | 228px rail, three groups | 76px bottom bar, four service screens + More | Sheet behind a header menu button |
| Primary action | In the header | Bottom-right, 20px in — on screens whose corner is free | In the header |
| Controls | 34–44px | **≥ 48px, a floor** | **≥ 48px** (inherits the tablet tokens) |
| Table rows | 44px | 56px | 56px |
| UI text | 14px | 15px | 15px |
| Figure band | 52px, four | 66px, **two** | 66px, four in 2×2 |
| Hover | May refine | **Never load-bearing** | **Never load-bearing** |

**Why the figure band goes back to four on a phone.** §07's "two per screen, not
four" is an argument about a tablet — held at arm's length, read at a glance,
mid-service. A phone is held close and read on purpose. Hiding half the band
there buys nothing and costs a second screen. The tablet range keeps the canvas
rule exactly.

**Three navigation shapes, one set of gates.** The rail, the bottom bar and the
phone sheet all take their entries from `hooks/use-workspace-nav.ts`, so they
can never disagree about what an operator may open. All three are always in the
tree; the breakpoints decide which paints, so rotation does not remount.

**Icon-only is a phone treatment, not a style.** Where a header action's label
makes it too wide at 390px, the label is hidden below `--bp-phone` and the icon
carries it, with `aria-label` at every width. It is never icon-only above the
breakpoint: a label removed where there is room to show it is information
thrown away. Where the label carries STATE — "Pause ordering" / "Resume
ordering" — the icon must carry that state too.

**And the width must be pinned back.** Hiding the label collapses the button to
its icon plus `size="filter"`'s horizontal padding — 42px measured at 390px,
while the tablet token takeover has already given the same button a height of
48. The result passes every gate and still hands the operator a target 6px
under the floor every other control on the surface clears. So an icon-only
header action carries `min-w-[var(--control-desktop-min)]`, squaring it from
the token that already sets its height. Above `--bp-phone` the returning label
makes the button wider than 48 on its own, so the rule costs nothing there.

*Found by measuring, not by reading.* Both grep gates, `tsc`, `lint` and the
build all passed on the 42px version — nothing in the toolchain measures a
rendered box. This is the class of defect that only a browser at the real
viewport will produce, which is the argument for checking one.

**A row that does not fit wraps; it does not become a scroller.** Four
workspace pages overflowed at 390 through the same shape — a row of fixed-width
content with an action cluster beside it — and all four were answered the same
way, so it is a rule rather than four fixes. Scroll only where the columns
carry cross-row alignment a reader is comparing down the page; a stock line, a
settings row and a menu item do not, and hiding their actions behind a
horizontal gesture costs discoverability for nothing. Prefer `flex-wrap` with
`min-w-[var(--row-content-min)]` on the content block over a `phone:`-gated
variant: wrapping engages only when the line is actually full, which is what
keeps the tablet range provably unmoved — verify that by measuring each row at
1024 and confirming its height still equals its tallest child.

The width is a **token, not a call-site choice**. `--row-content-min` (14rem)
is the width a row's content block keeps before its action cluster wraps, and
it is the only value any of these rows may use — the same form as
`min-w-[var(--control-desktop-min)]` on an icon-only header action above.
Neither grep gate reads `min-w`, so an arbitrary `min-w-[12rem]` passes every
check and still breaks rule zero; a row that needs a different width is a
design question, not a second literal.

The tablet half of this is one media query in `globals.css` that redefines five
tokens below the breakpoint. Because the product reads its sizes through those
tokens rather than through literals, that single rule moves every control
height, every row and all UI text on every screen at once. Nothing new is
declared — the tablet values simply take over.

The structural half — bottom bar, thumb-reach action — lives in
`components/business-bottom-bar.tsx` and `components/business-shell.tsx`. Both
navigations are always in the tree and share `hooks/use-workspace-nav.ts`, so
they can never disagree about what an operator may open.

**One deliberate divergence from the canvas.** The floating action does not
appear on every screen. The canvas floats it over a read-only feed; on a data
table it sits permanently on top of one row's controls, which is a control you
cannot reach rather than one you can. It renders where the corner is free.

## Language

Some of this is legal, not editorial. `write-crowbar-operational-copy` owns it
in full; load that skill when writing user-facing strings.

- **Settlement.** Crowbar does not take payment, run a till, or issue any
  fiscal document. The venue's own register is the payment and fiscal
  authority. Crowbar records a staff assertion that settlement completed: the
  term is **settled externally**, with a name and a timestamp.
- **Never used, anywhere:** paid · payment successful · payment processed ·
  charge · take payment · checkout · transaction complete · receipt · invoice ·
  tender · refund · void · card terminal. No receipt or card-terminal
  iconography. **No green success-tick pattern.**
- **Money.** Money the venue took is **sales value**. The dashboard figure is
  **ordered today**. An uncollected total is never called revenue.
- **Locale.** German formatting throughout — `4.318,00 €`, `0,9 l`,
  `Fr, 28. Aug`, 24-hour time, weekday abbreviations SA SO MO DI MI DO —
  produced by locale-aware formatting driven by the venue's own configured
  region and timezone, **never hard-coded strings**. Money through
  `client/lib/money.ts`, dates and times through `client/lib/business-time.ts`
  with the business timezone, quantities through `client/lib/units.ts`, all
  reading `client/contexts/regional-context.tsx`. `<html lang>` follows the
  same tenant locale via `client/components/document-locale.tsx`.
- **Roles.** The real matrix is `owner`, `manager`, `host_server`
  ("Host / server"), `bar_kitchen` ("Bar / kitchen"), `inventory_operator`
  ("Inventory operator") — see `client/lib/permissions.ts`. Marketing copy must
  use these, not an invented five.
- **A page may not claim a capability the product lacks.** This is the same rule
  as the settlement vocabulary, applied to features rather than to money, and it
  outranks the canvas copy. Corrections made during the port, each recorded in
  `docs/TODO.md` §7a: the landing FAQ no longer says staff devices keep taking
  orders offline (there is no outbox), no longer offers spreadsheet menu import
  or printer support (neither exists), and names the real five roles. The
  register panel's setup list was rewritten to what setting up a venue actually
  involves. The sign-in ladder does not name attempts remaining, and the
  "keep me signed in" checkbox is not rendered, because neither is backed.
- **Marketing sample data.** The landing hero's night panel is an illustration
  and the only place in the product where figures are not read from the API —
  a visitor has not signed in and has no tenant. It is labelled as an example
  for assistive technology. Nothing else on any surface is hardcoded.

## Accessibility

AA for small text everywhere, measured rather than estimated:

- Body ≥ 7:1 on both grounds.
- Muted `#6B6A5E` on paper 4.96:1; `#B8B6A8` on ink 9.06:1, on surface 8.48:1.
- Ink on lit green 9.43:1; paper on deep green 8.38:1.
- Every cell of the severity matrix ≥ 4.5:1 — the badge is 10px mono, so the
  small-text floor applies.
- `--field-invalid-ink` `#D98B78`: ink 6.96:1 · surface 6.52:1. Added during
  the port because `--field-invalid` `#7A2414` measures 9.14:1 on paper but
  **1.84:1 on ink** and had no dark-ground pair, while the product has forms on
  dark surfaces (settings, side panels, dialogs, menu editor, filter bars). It
  is deliberately muted against `--critical-text-ink` `#F2604F` so a field
  error never reads as a service alarm on the same screen.

Every severity colour is paired with a word. Every interactive element has a
visible focus state using the declared ring (`--focus-ring-paper` /
`--focus-ring-ink`).

## Backend gaps this design assumes and the product does not yet supply

Stage 7 is a presentation stage: it does not add features. Where the design
assumes state the backend cannot supply, the surface ships **honest** rather
than simulating it. Each is tracked in `docs/TODO.md`.

| Assumed | Reality | Disposition |
| --- | --- | --- |
| Ticket **target time** | `Order` has `placedAt` and a `statusTimeline`, so age is computable; no target threshold is configured anywhere. | Age renders neutral. Ageing colour cannot be applied. |
| Per-party **quoted wait** | `measured_wait_estimate` is a board-level median; `QueueEntry` stores no quote-at-join, and the quote moves during service. | Wait renders neutral. |
| Offline bar duration + held count | The hooks now also report `lastContactAt`, added during the port. There is still no offline outbox. | Bar shows real time-since-contact; the **held count is omitted**, because there is nothing held. |
| Table assignment on the overview's arrivals list | `upcoming_reservations` carries no table id. | The table column is an em-dash for every row, and "no table" — a real attend case — cannot be shown there. |
| Nav badge counts for Tickets, Reservations, Inventory | Only `clientGetQueueActiveCount` exists. | Only the queue badge ships. Three more 30-second polls is a change to how the app loads, not a presentation change. |
| Header "Live · synced 2s ago" | The shell holds no socket; the four that exist belong to the boards. | Not shown. A header claiming a connection it is not watching is the failure the offline bar exists to prevent. The clock beside it **is** real, in the venue's own timezone. |
| Account lockout and "attempts remaining" | `auth_login_identity` is a 10-per-10-minute rate limit keyed on IP + email; a 401 carries no counter. | The ladder ships rungs 1 and 2 and the locked rung against the real 429, counting down from the server's `Retry-After`. No attempt count is claimed. |
| Password-reset link expiry time | `forgot-password` returns nothing about the token. | The screen states the window ("works for one hour"), not a wall-clock time. |
| "Keep me signed in on this device" | Every session is a 7-day cookie. | Not rendered. The control would change nothing. |
| Exact service-day cutoff on a tab | `service_day_cutoff` is not on the tab payload. | "Open since last night" compares business-local calendar days, documented at the call site. |
| "Right now" activity feed | No live event feed. `staff_actions` is a range report and deliberately not an audit log. | Honest empty/unavailable, or composed only from existing endpoints. |
| "Close the night" | No service-day close action exists. | Not built. |
| Trial countdown | No subscription model on `Business`. | Omitted. |
| First-sign-in orientation panel | No per-staff "seen orientation" flag. | Deferred. |

**Three of the four exhaustive critical cases are therefore not currently
derivable.** Only "live board that has lost its connection" is. This does not
change the rank — it means critical legitimately appears on very few surfaces
until targets and quotes exist. That is the correct honest outcome, not a bug
in the port.

## Open design questions

Eight of the ten are now closed. Two stand, and **neither is an outstanding
code change**: one is an action in the design file outside this repo, the
other is a question for a surface that does not exist yet. The numbers below
are the original question IDs and are kept stable, so they are neither
sequential nor unique across the blocks.

**Answered in the completion pass:**

1. ~~**Categorical chart palette.**~~ **Answered.** `--series-1..5` are
   declared in the token block and validated on both grounds — see *Categorical
   series* above. The earlier claim in this file that `--chart-1..5` were
   "aliased to brand plus the neutral ramp as a provisional stand-in" was
   **wrong**: those aliases were never written, and `grep chart
   client/app/globals.css` returned nothing. Insights now renders on the
   declared set.
2. ~~**Per-tenant service-type colours.**~~ **Answered, by the same set.** The
   picker offers the five declared slots and nothing else. It previously
   offered twelve arbitrary hues *plus a free hex field and a native colour
   well*, which meant a venue could enter any colour in the sRGB gamut — the
   largest single hole in rule zero. The stored shape is unchanged (a hex
   string), so no migration was needed; only the set of reachable values
   narrowed.
5. ~~**Password strength and the attend colour.**~~ **Closed as decided.** §08
   governs over the Auth canvas: the meter uses the validation channel and a
   neutral, never attend. Implementation carried a real bug alongside the
   settled question — it rendered `tone: "invalid"` from the first keystroke,
   so every password field flashed the validation colour before the person had
   done anything wrong. `PasswordStrength` now takes `touched` and holds the
   invalid tone until the field is blurred.

**Closed in the design closeout pass:**

3. ~~**Phone.**~~ **Closed as re-sequenced, not cancelled.** The product is
   designed at 1280+ and 1024×768, and both shipped. There is no phone canvas,
   and `docs/TODO.md` stage 7's exit gate **was never met on that clause** —
   this file recorded it as unmet and that record was correct. The phone answer
   is a React Native client, which is stage 11 and comes after the pilot, and
   it is wanted regardless of what the venue prefers. The clause now lives in
   stage 11's gate; stage 7's gate claims only the two targets that exist. It
   moved because the answer belongs to a different client, not because the
   requirement went away.

   **Amended 2026-09-03.** The workspace now carries a `phone:` floor — a
   header that stays on one line, a navigation sheet, a 2×2 figure band and
   icon-only header actions. That is *not* the phone answer and does not
   re-open or close this question: a floor keeps a surface usable at 390px, a
   canvas decides what a phone surface should be. Stage 11 still owns the
   second. See § Responsive.
4. ~~**440px side-panel breakpoint.**~~ **Closed — declared.** It is now
   `--bp-panel: 440px` in the token block beside `--bp-desktop`, bridged as
   `--breakpoint-panel`, which generates the `panel:` variant `ui/sheet.tsx`
   uses in place of its bare `min-[440px]:`. The bridge value is written
   literally with a comment tying it to `--bp-panel`, because a media query
   cannot read a custom property — the constraint `--bp-desktop` already
   documents. Same compiled media query, so nothing moved on screen.
6. ~~**Password minimum: 10 or 12.**~~ **Closed as decided: 12.** A form
   promising a laxer rule than the API fails at submit instead of at the field,
   which is the worse failure — so the **canvas is corrected to match the code**,
   not the reverse. Nothing in the product changed: `PASSWORD_MIN_LENGTH` and
   the server were already 12 and the UI derives its copy from the constant.
   Three comments still used "10 characters minimum" as their worked example
   (this file, `ui/input.tsx`, `lib/severity.ts`); all three now say 12.
7. ~~**The marketing measurement layer.**~~ **Closed as decided: it stays
   outside the token block, as a documented exception.** 31 `clamp()`
   expressions and six editorial type sizes that sit between the ten declared
   steps. Promoting them would roughly double the declared scale, and almost
   every step it added would serve exactly one page — a marketing page and a
   service board are different typography problems. They are already
   quarantined in the `.mkt-*` layer of `globals.css` rather than inlined, and
   no product surface uses those classes. This remains the *only* place sizes
   live outside the declared scale, and it is **not** precedent for a second
   one: another exception is a design question, not a call-site decision.
8. ~~**`bar_kitchen` navigation breadth.**~~ **Closed — it was never a design
   question.** The States canvas shows a bartender with a three-item nav and
   "cannot see guest records"; the real role also holds `customers.view`,
   `floor.view`, `queue.view`, `reservations.view`, `menu.edit` and
   `overview.view`, so an honest nav renders more. Rendering from the real
   capability matrix is the correct behaviour — the divergence is in what the
   role holds, not in how it is drawn. Narrowing it is a **permissions** change,
   deferred to whoever next revisits the capability matrix.

**Still open:**

5. **`--field-invalid-ink` — codebase side closed; one action left, and it is
   not in this repository.** Added under instruction during the port because
   `--field-invalid` measured 1.84:1 on ink. This entry used to say "confirm it
   lands in the canonical `crowbar-tokens.css`", which nobody can do here:
   **`crowbar-tokens.css` does not exist in this repository.** It is the design
   file and it lives outside the repo — `client/app/globals.css` describes its
   own `:root` as a port *of* it. The codebase half is therefore done: the token
   is declared in `globals.css` with its measured ratios (ink 6.96:1, surface
   6.52:1). What remains is a **user action in the design file** — add the token
   there so the two do not diverge. Creating a `crowbar-tokens.css` in the repo
   to make the sentence resolvable would be the wrong fix.
9. **A spinner.** The declared five motions have no "work in progress"
   animation. Thirteen call sites used Tailwind's `animate-spin`, which carries
   its own 1s linear rotation. All of them already stated the wait in words, so
   the icon was removed rather than a sixth motion declared. If a future
   surface needs a spinner with no accompanying text, that is a design question.
