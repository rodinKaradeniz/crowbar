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

**Every hit that survives is one of four named things, and nothing else.** If a
hit does not fall into one of these, it is a bug:

| What | Where | Why it is there |
| --- | --- | --- |
| Held chart series | `app/business/insights/` | The token file declares no categorical palette. Open question 1; Insights ships its chrome ported and its series untouched. |
| Tenant-chosen colours | `components/color-picker.tsx`, `profile/types/`, `schedule/`, `onboarding-wizard.tsx`, `lib/mock-data.ts` | A venue picks a service-type colour from a fixed palette of twelve. This is **tenant data**, not design tokens — but the palette sits entirely outside the system, and is the same open question as the chart series. Deleting it is a feature removal, so it is recorded rather than changed. |
| Library selectors | `components/ui/chart.tsx` | Attribute selectors matching hexes that Recharts itself emits (`stroke='#ccc'`). These are matched, never declared. |
| A hex in a placeholder | `components/color-picker.tsx` | The string `#000000` shown to a user typing a colour. |

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
  never borrows a severity token. *"Too short — 10 characters minimum"* is
  this, not attend: a password-length hint is not a service item to be handled
  before the night ends.
- **Brand.** Identity, the primary action, the active nav item, and
  live-and-healthy. Green never means "good news about a number". If green ever
  reads that way, it has been misused.

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

The same layer holds the auth measurements (`.auth-*`), for the same reason.

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
  actions in a bordered footer. Full width under 440px.
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

All motion is off under `prefers-reduced-motion`.

## Responsive

Two targets, and no others. There is no phone design; if a task needs one, that
is a design question, and stage 7's phone exit gate is **recorded as unmet**.

| | Desktop | Tablet |
| --- | --- | --- |
| Width | ≥ `--bp-desktop` (1280) | 1024×768 |
| Navigation | 228px rail, three groups | 76px bottom bar, four service screens + More |
| Primary action | In the header | Bottom-right, 20px in — on screens whose corner is free |
| Controls | 34–44px | **≥ 48px, a floor** |
| Table rows | 44px | 56px |
| UI text | 14px | 15px |
| Figure band | 52px, four | 66px, **two** |
| Hover | May refine | **Never load-bearing** |

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

1. **Categorical chart palette.** The token file declares no multi-series or
   multi-category chart colours. `/business/insights` renders five guest
   segments; `--chart-1..5` are aliased to brand plus the neutral ramp as a
   *provisional* stand-in and must not be treated as a sanctioned series
   palette. Insights' own series colours are held on raw hex until this is
   answered — the one documented exception to the raw-hex check.
2. **Phone.** The product is designed at 1280+ and 1024×768. `docs/TODO.md`
   stage 7's exit gate requires phone-capable staff surfaces; there is no phone
   canvas. Recorded as unmet.
3. **440px side-panel breakpoint.** Stated in §06 prose but absent from
   `crowbar-tokens.css`. Used as an arbitrary variant in `ui/sheet.tsx` pending
   a token.
4. **`--field-invalid-ink`.** Added under instruction during the port. Confirm
   it lands in the canonical `crowbar-tokens.css` so the design file and the
   codebase do not diverge.
5. **Password strength and the attend colour.** The Auth canvas's notes say
   "amber is a password that isn't strong enough yet". §08 of the System canvas
   puts that exact case on the form-validation channel instead — "'Too short —
   10 characters minimum' is this, not attend". The two boards disagree. §08
   governs here, so `components/auth/password-strength.tsx` uses the validation
   colour and a neutral, never attend: a password hint must not read as a
   service alarm on a screen that also shows real failures.
6. **Password minimum: 10 or 12.** The canvas says 10 throughout;
   `PASSWORD_MIN_LENGTH` and the server enforce 12. The screens ship 12.
7. **The marketing measurement layer.** See *The marketing layer* above — 31
   `clamp()` expressions and six editorial type sizes that sit between the ten
   declared steps. Transcribed, not invented, but they are not tokens.
8. **`bar_kitchen` navigation breadth.** The States canvas shows a bartender
   with a three-item nav and "cannot see guest records"; the real `bar_kitchen`
   role also holds `customers.view`, `floor.view`, `queue.view`,
   `reservations.view`, `menu.edit` and `overview.view`, so an honest nav
   renders more. The nav renders from the real capability matrix. Narrowing the
   role is a stage-6 permissions change, not a design one.
