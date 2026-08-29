# Deferred Work and Known Gaps

This is Crowbar's canonical roadmap, delivery order, and record of deliberate
deferrals. An item is not authorization to expand the current request; confirm
scope with the user before implementing it.

For new non-trivial items, record what is missing, why it is deferred, the
dependency or trigger for revisiting it, and any tempting partial solution that
must not be introduced. Preserve completed roadmap records in place; use
strikethrough plus `DONE` for newly completed discrete items where practical.

Status labels:

- **Complete:** implemented and verified locally.
- **Ready:** sufficiently understood to plan.
- **In progress:** an approved stage has landed partially and names its next
  boundary explicitly.
- **Needs decision:** product or architecture choice is unresolved.
- **Blocked:** requires external state or authority.
- **Deferred:** intentionally not current.

## Confirmed MVP Sequence

The first release target is a supervised pilot at a single-location bar in
Germany. Crowbar owns the operational record from reservation through service,
ordering, inventory, purchasing, and cost control. The venue's separate,
German-compliant register remains the fiscal and payment authority. Crowbar
records only that a tab was **settled externally**; it does not take payment,
operate a cash register, issue a fiscal receipt, or claim fiscal/accounting
authority in this MVP.

Complete these stages in order unless the user explicitly reprioritizes them.
Stages 0–6 build the operational record, stage 7 makes it good to use, stage 8
proves it locally, stages 9–10 put it in front of the venue, and stage 11 adds
a second client once the first one is settled.

Stage 9 remains an external deployment action requiring separate user
authorization even after the local release gate passes.

### 0. Freeze the MVP contract and baseline — complete

- **Complete — confirmed boundary:** MVP covers venue/staff setup;
  reservations, protection, and the future-reservation waitlist; current-service
  queue; areas, tables, assignments, and seatings; menus, modifiers, happy hour,
  availability, staff/QR ordering, fulfillment, tabs, and external settlement;
  inventory, recipes, receiving, waste, stock counts, suppliers, purchasing,
  cost control, guest CRM/privacy, and operational reporting.
- **Complete — fiscal and payment boundary:** The existing compliant register
  remains the source of truth for taking payment, payment method and tender
  details, cash, tips, refunds, receipts, invoices, tax reporting, and fiscal
  exports. Crowbar uses the phrase **settled externally**, never “payment
  processed” or an equivalent claim. Supplier-invoice payment is also outside
  Crowbar; purchasing ends at invoice/reference capture and reconciliation.
- **Complete — initial market boundary:** The first pilot is a single-location
  German bar using EUR, `de-DE`, `Europe/Berlin`, tenant-country phone handling,
  and tenant-configured tax profiles. The area-based Floor board is sufficient
  for the pilot; geometry and drag-and-drop remain later work.
- **Complete — documentation alignment:** `AGENTS.md` and the owning documents
  under `docs/` use the same 0–11 order, external-settlement language,
  Germany/non-fiscal boundary, local-first gate, and post-MVP exclusions.
- **Complete — authoritative release inventory:**
  [`MVP_ACCEPTANCE.md`](MVP_ACCEPTANCE.md) traces every current public and staff
  route through a shared API/service/persistence/event/test authority registry
  and classifies it as core, supporting, optional, redirect, remove/hide, or
  post-MVP.
- **Complete — acceptance map and mismatch assignment:**
  [`MVP_ACCEPTANCE.md`](MVP_ACCEPTANCE.md) owns the initial P0/P1/P2 register,
  assigns every audit finding to a numbered stage, and defines the risk-ranked
  journey, invariant, failure, test-level, and release-evidence matrix for
  stages 1–8. Later implementation closes those rows instead of creating a
  parallel checklist.
- **Exit gate — met:** The product/fiscal boundary is consistent across
  canonical documentation and planned contract vocabulary; every currently
  known code/schema mismatch is assigned to a numbered stage; every visible
  route has an explicit MVP disposition; and no unresolved decision blocks
  stage 1.

### 1. Correctness and security foundation — complete

**Completed locally 2026-08-14.** Sections 1A–1E landed together in migrations
031–036 and their application/frontend counterparts. The completed boundary
includes a repeatable fresh-database verifier; staff-only auth, revocable
sessions, secure invitation/recovery lifecycles and role/tenant enforcement;
server-authoritative order resolution and concurrent idempotency; ledger-safe
inventory plus discrepancy reconciliation; reservation/CRM idempotency,
privacy, channel-delivery and service-time integrity; consistent route guards;
and removal of misleading/dead MVP states. The Stage 1 evidence and closed-risk
mapping are recorded in [`MVP_ACCEPTANCE.md`](MVP_ACCEPTANCE.md).

The full gate passed: frontend lint, 41 Vitest tests, TypeScript, and production
build; 150 PostgreSQL backend tests; six reproducible ML tests; migrations
001–036 plus repeat-safe seed on a disposable database; and diff hygiene. The
remaining `python-jose`, Node test-runtime, and Next.js middleware deprecation
warnings are dependency/framework maintenance debt, not failed product checks;
they are retained below under post-stage maintenance.

Do not add later-stage product breadth until these known defects and their
regression tests are closed. Work in the following dependency order.

#### 1A. Re-establish a trustworthy baseline — complete

- Fix all frontend lint errors and adjudicate material warnings; keep the
  production build and existing frontend tests green.
- Fix the `max_concurrent_bookings` schema/default drift so migrations, ORM,
  response schemas, product rules, and tests agree on the positive default.
- Re-run the full PostgreSQL suite, remove its current failure, triage the
  deprecation-warning backlog, and create a reproducible ML test environment.
- Add a repeatable fresh-database migration-and-seed verification. Expand the
  canonical demo seed only enough to exercise stage-1 invariants and assert its
  schema/relationship validity; stage 8 owns the richer scenario. Never use the
  stale destructive reset path.
- Capture the initial P0/P1 register in the acceptance map and require a
  regression test for each closed defect.

#### 1B. Repair tenant isolation, authentication, and staff authority — complete

- Bind staff creation to `get_current_business`; reject any cross-tenant
  `business_id` or `user_id` association and add route/service isolation tests.
- Constrain staff roles, enforce a role hierarchy, prevent manager-to-owner
  escalation, and protect self-removal and the last owner. Ordinary staff must
  not see privileged controls that will be rejected by the API.
- Make account disablement and staff removal effective for new authentication
  and existing sessions. Add token/session revocation for disablement, removal,
  password change, and other security-sensitive account changes.
- Hash invitation tokens and add pending-invitation visibility, revoke, resend,
  expiry, duplicate handling, role validation, and truthful delivery results.
- Enforce backend password policy and complete safe password recovery with
  single-use expiring tokens, rate limits, generic responses, and session
  revocation. Remove customer-account registration/login redirects, the
  nonexistent customer dashboard destination, and phone-OTP entry points from
  the MVP; public guests remain account-free.
- Minimize public business projections and replace unrestricted reservation
  embedding with an intentional deployment/business allowlist.

#### 1C. Restore server-authoritative ordering — complete

- Resolve every selected modifier from tenant-owned menu data. Reject unknown,
  wrong-item/wrong-group, unavailable, duplicate, or min/max/required-invalid
  choices; compute names and deltas on the server and never accept a submitted
  price delta as authority.
- Reject unknown, inactive, unavailable, unpublished, or wrong-menu items and
  empty resolved carts. Validate business, location, table, seating, tab, menu,
  item, and modifier ownership as one placement invariant.
- Scope order idempotency by business and make same-key/same-request retries
  stable while rejecting same-key/different-request reuse. Cover concurrent
  public QR and staff-tab submission.
- Preserve authoritative happy-hour, alcohol, line-price, and inventory
  effects; leave one server-owned extension point for stage 2's tax snapshot
  rather than inventing tax logic in staff composition.
- Stop describing uncollected order totals as revenue. Until external
  settlement lands in stage 4, reports distinguish ordered value, open-tab
  value, and any legacy simulated closure explicitly.

#### 1D. Repair inventory, CRM, reservation, and time integrity — complete

- Lock inventory rows or use atomic balance updates so concurrent movements
  cannot diverge from the movement ledger. Add a reconciliation command/check
  and treat a mismatch as an integrity incident.
- Archive inventory items instead of deleting their movement history. Validate
  tenant ownership of every location and related identifier; restore
  non-negative update constraints and correct absent-versus-null clearing
  semantics.
- Reject an entire invalid recipe instead of silently skipping missing,
  foreign, or duplicate ingredients. Persist and surface automatic-deduction
  discrepancies while keeping fulfillment non-blocking; deduplicate low-stock
  alerts to threshold crossings.
- Align migration 029, ORM, schemas, mappers, and tests for anonymised nullable
  reservation contact fields. Correct consent withdrawal, suppression and
  merge behavior; derive retention inactivity from authoritative activity; and
  ensure tab/order history attaches to the canonical customer.
- Add public reservation idempotency. Format reminders and all “today” metrics
  by business timezone/service day, record channel-specific delivery attempts,
  retry transient failures, and escape user content in HTML email.
- Cover reservation-management and waitlist tokens, expiry, revision, stale
  availability, concurrent acceptance, late changes, grace periods, DST, and
  module-disabled behavior with PostgreSQL tests.

#### 1E. Remove dead or misleading product states — complete

- Enforce onboarding and module guards consistently on every business page,
  including Orders; make frontend authorization match the server matrix.
- Complete staff forgot/reset password. Remove or hide customer account/OTP,
  contact false-success, placeholder reviews, stale QR/table entry, unapproved
  pricing claims, and any other dead/non-MVP path identified by the stage-0
  inventory until it has an authoritative workflow.
- Replace browser `alert()`/`confirm()` and misleading success/error states
  with the shared accessible interaction patterns.
- Use one currency/locale/timezone/phone boundary in preparation for stage 2;
  eliminate hard-coded `$`, `EUR` glyph assumptions, browser-local business
  times, and US-default phone parsing from retained MVP paths.
- Add focused frontend and PostgreSQL regression coverage for ordering,
  inventory, queue, tabs, menu, CRM, roles, module gates, money/time mapping,
  and HTTP/WebSocket parity instead of relying on the current narrow suites.

- **Stage 1 verification:** frontend lint, focused tests, full frontend test
  suite, and production build; full PostgreSQL backend suite; ML import/tests;
  fresh migration plus seed; `git diff --check`; targeted concurrency and
  tenant-isolation tests. Record anything genuinely blocked rather than
  weakening the gate.
- **Exit gate:** zero known P0/P1 security, tenant, pricing, inventory, privacy,
  reservation, or time defects; no failing repository check; every fixed defect
  has a regression test; every retained route has working auth, onboarding,
  entitlement, failure, and empty-state behavior.

### 2. Germany-ready operational configuration — complete

**Completed locally 2026-08-14 in migration 037.** The implementation is
country-neutral; Germany is the first editable demo preset rather than a
runtime legal rules engine.

- **Complete — regional tenant boundary:** Businesses persist an ISO country,
  ISO currency, BCP 47 formatting locale, IANA timezone, editable tax label,
  country-parsed E.164 phone, free-text address, and existing editable legal
  drinking age. Registration, onboarding, public pages, staff pages, money,
  operational dates, and service time consume those values. Applying a country
  suggestion is an explicit UI action and never silently overwrites tenant
  choices. Product copy remains English; locale controls formatting only.
- **Complete — safe currency lifecycle:** Currency is editable before priced
  catalogue, inventory-cost, or order records exist and is locked afterward.
  Storage supports ISO currencies with up to four decimal places; line totals
  quantize half-up to the selected currency's minor unit.
- **Complete — operational tax authority:** Owners/managers create stable,
  tenant-scoped tax profiles and append effective-dated versions with rate,
  inclusive/exclusive policy, note, and actor. They must explicitly assign a
  profile when creating a priced item; runtime code does not infer food or
  beverage treatment. Ordinary staff may edit non-tax item details and reuse
  already-classified library items but cannot create profiles, change versions,
  archive assigned profiles, or change assignments.
- **Complete — immutable calculations:** Server-authoritative order placement
  resolves the effective item profile after happy-hour/modifier pricing and
  snapshots currency, profile/version identity and label, rate, inclusion
  policy, net subtotal, tax, and gross total on every line plus order totals.
  Later profile changes do not rewrite old orders. Public checkout and menu
  disclosures label this as estimated operational/non-fiscal tax.
- **Complete — editable German seed:** The Puzzles demo uses DE/EUR/`de-DE`/
  `Europe/Berlin` and editable 19% beverage/standard, 7% food/reduced, 0%
  exempt, and 0% custom examples. These are demo suggestions to verify with the
  venue's adviser, not automatic classification or legal advice. Non-German
  tenants receive editable zero-rate placeholders and configure their own
  profiles without a code change.
- **Complete — audit and proof:** Regional changes retain before/after values
  and actor; tax history is append-only. Unit/integration coverage exercises
  identifier/phone validation, currency precision, inclusive/exclusive and
  mixed-profile rounding, temporal versions, immutable snapshots, permissions,
  tenant isolation, locale formatting, and Berlin DST. The full backend,
  frontend lint/test/type/build, migration-upgrade, and fresh repeat-seed gates
  pass; [`MVP_ACCEPTANCE.md`](MVP_ACCEPTANCE.md) records exact evidence.
- **Exit gate — met:** A German tenant can configure and audit operational tax
  treatment without Crowbar representing itself as a fiscal cash register.

### 3. Complete the guest-to-table workflow — complete

**Completed locally 2026-08-19 in migration 038.** Queue policy, capacity,
idempotency, reasoned transitions and delivery truth now share one service-day
lifecycle for public and staff walk-ins. The future waitlist has complete
management, delivery, expiry and reservation-acceptance paths, while Floor
remains the sole authority that creates real seating. Closure evidence is in
[`MVP_ACCEPTANCE.md`](MVP_ACCEPTANCE.md).

**Security hardening completed locally 2026-08-23 in migrations 041–043.**
Reservation, waitlist, queue and table-browser authority now uses exchanged
purpose-scoped cookies and hashed persisted credentials; public responses are
exact projections; Stage 3 tenant relationships have composite constraints;
and capability routes have bounded bodies, abuse limits and non-enumerating
failures. Publication and deployment remain separately gated.

- Make the current-service queue explicitly open/closed and schedule/capacity
  aware. Add staff-created walk-ins, duplicate/idempotency protection,
  called/left/no-show/removal reasons, and a measured or configured wait
  estimate; omit the estimate rather than fabricate it.
- Record notification attempts and delivery state before claiming a guest was
  reached; add retry, SMS fallback where configured, and staff-visible failure.
- Complete future-waitlist decline, cancel, expiry, removal, active/history
  filtering, public availability gating, fallback channels, and staff alerts.
- Verify the complete book → manage/reconfirm/reschedule → assign → call → seat
  journey, including table combinations, planning versus occupancy, no-shows,
  service-day rollover, DST, conflicts, and reconnect behavior.
- Keep the confirmed area-based responsive host board. Defer geometry,
  drag-and-drop, automatic server sections, and richer meal stages until pilot
  evidence shows they are necessary.
- **Exit gate — met:** public and staff paths reliably turn a reservation or walk-in
  into one real seating without bypassing capacity, table, tenant, or delivery
  rules.

### 4. Complete ordering and external settlement — complete

**Completed locally 2026-08-19 in migrations 039–040.** Preparation stations,
line-level fulfillment, exact movement linkage, audited correction/cancellation,
authoritative item availability, external-settlement history, controlled reopen
and tab invalidation/reconciliation now form one shared-tab lifecycle. Crowbar
records only the venue register's external-settlement assertion.

**Security hardening completed locally 2026-08-23 in migrations 041–043.** A
printed table QR can create only a pending browser session for the current
seating; staff approval is tenant- and seating-bound, and deny/close/reseat/
expiry/rotation revokes it. Order credentials are stored as hashes, public menu
and order DTOs exclude operational internals, staff WebSockets authenticate in
a bounded first frame, and missing Stage 4 tenant relationships have composite
database constraints.

- Add tenant-configurable preparation stations and replace hard-coded
  `kitchen | bar | any` routing. Support audited order edits/cancellation,
  station timing, useful all-day counts, and real-time ticket changes.
- Make item availability one authoritative 86 action across public and staff
  ordering. Preserve per-surface delivery/reconciliation state if a projection
  fails.
- Add real-time tab refresh plus explicit reconnect/stale indicators. Lock down
  rules for changing a tab after settlement and allow manager reopening only
  with actor, timestamp, and reason.
- Replace simulated settlement with `open` / `settled_externally` state,
  `settled_at`, `settled_by`, immutable total snapshot, optional informational
  method (`cash | card | mixed | other`), note, and external-register reference.
  Method is not a tender ledger and cannot represent partial payment.
- Require external settlement before closing the seating; preserve recipe
  deduction/reversal and discrepancy behavior through order corrections.
- Explicitly exclude payment collection, card/cash data, tips, split or partial
  tenders, change calculations, refunds, receipts, invoices, bank settlement,
  deposits, and card holds.
- **Exit gate — met:** staff and QR rounds share one authoritative tab, stations can
  fulfill it in real time, stock effects reconcile, and staff can safely record
  that the external register completed settlement without Crowbar claiming to
  process payment.

### 5. Finish stock, purchasing, and cost control — complete

**Schema started locally 2026-08-24 in migrations 044–047; completed locally
2026-08-25 in migration 048.** Suppliers, supplier products with lead times,
purchase orders with a deliberate terminal-state map, partial receiving with
retry-safe idempotency, pack conversions, stocktake and cycle-count sessions
with bar-native pack and keg-level entry, a CSV count-sheet round trip,
purchase-price history, delivery-note attachments, and cost control spanning
valuation, recipe cost, margin, pour cost, consumption variance, waste and
controllable COGS now run on one movement ledger with a staff UI. Supplier
payment remains outside Crowbar. Location transfers were deliberately cut — see
the deferred entry under Product Architecture.

- Add supplier records, supplier products, lead times, purchase orders,
  approval/status flow, partial receiving, substitutions, discrepancies,
  delivery/invoice references, attachment metadata, and purchase-price history.
  Paying supplier invoices remains outside Crowbar.
- Add canonical pack and unit conversions across case, each, bottle, keg,
  kilogram, litre, and millilitre without creating a second inventory unit
  system. Keep the movement ledger authoritative.
- Add stocktake and cycle-count sessions; counted-versus-book variance;
  bar-native open-bottle/tenthing and keg-level entry; reasoned shrinkage; and
  safe CSV import/export. Location transfers are deferred, not delivered. Full
  offline counts remain post-MVP unless the pilot proves a hard need.
- Add inventory valuation, recipe cost, menu gross margin, pour cost,
  actual-versus-theoretical consumption, controllable COGS, waste/variance,
  cost-change alerts, and explainable reorder suggestions using par, forecast,
  open purchase orders, and lead time.
- Keep accounting exports provider-neutral and deferred until the first venue's
  accountant confirms the required German format and authority boundary.
- **Exit gate — met:** a manager can order, receive, count, reconcile, and
  explain stock and margin from one auditable ledger without entering or
  implying payment data. Evidence in `MVP_ACCEPTANCE.md`.

### 6. Staff, CRM, and operational reporting — complete

**Completed locally 2026-08-26 in migration 049.** Authorization moved from a
flat role list to a fixed five-role capability matrix covering every
authenticated route; guests can raise their own access, correction, deletion and
consent-withdrawal requests through the reservation link they already hold;
consent withdrawal now actually suppresses marketing at the send boundary; a
reporting surface covers bookings and no-shows, queue wait and seating
conversion, table utilization and turn time, station throughput and ticket
timing, the three separate value figures, stock and waste, purchasing spend and
staff actions, each over a chosen range with CSV export; and Insights survives an
ML restart by serving its last result marked stale. Evidence in
`MVP_ACCEPTANCE.md`.

- Replace coarse operational access with a secure fixed MVP permission matrix:
  owner, manager, host/server, bar/kitchen, and inventory operator. Shared-device
  PIN unlock and a tenant-custom permission builder are deferred with triggers
  below.
- Complete the guest timeline across reservations, queue, tabs, and orders;
  guest-led data-request/withdrawal intake; consent suppression; privacy contact;
  scheduled retention; conservative merge; and venue-owned portable export.
  Automated marketing, loyalty, and review campaigns remain deferred.
- Provide authoritative reports for reservations/covers/no-shows, queue wait
  and seating conversion, table utilization/turn time, ordered items/stations,
  open versus externally settled tabs, inventory movement and variance,
  purchasing cost, recipe cost, margin, waste, and staff actions/ticket timing.
  CSV ships; PDF is deferred with a trigger below. No fiscal or accounting
  report exists.
- Keep ML optional and failure-tolerant. Persist latest results and establish
  minimum-data, reproducibility, leakage, drift, version, and scheduling rules;
  do not let ML readiness block the core pilot.
- **Exit gate — met:** each pilot role sees only the data/actions it needs,
  managers can explain service and stock outcomes, and privacy operations are
  usable without marketing automation. Evidence in `MVP_ACCEPTANCE.md`.
- **Deferred — shared-device PIN unlock and automatic lock.** Nobody has
  confirmed the pilot runs a shared terminal, and building a second
  authentication path for a workflow that may not exist is exactly the
  over-building `RULES.md` warns about. Every role signs in with its own account
  today. **Trigger:** the venue confirms a shared terminal behind the bar that
  more than one person uses during a shift.
- **Deferred — PDF report export.** CSV covers the operational need: a manager
  takes a figure into whatever they already use. PDF means a new dependency and a
  rendering path this repository has never had. **Trigger:** a pilot user needs
  to hand a report to someone on paper.

### 7. Interface redesign pass — ready after stage 6

The first six stages build the operational record; this stage makes it good to
use. Run it once every workflow is authoritative, so the redesign works on
finished behavior instead of guessing at it, and so stage 8's release gate and
demo journey validate the interface the pilot will actually ship.

This is a presentation stage. It does not add features. If a surface needs a
field, endpoint, or rule that does not exist, record it in `TODO.md` and leave
the surface honest — do not grow stage 7 into stage 5 or 6 work.

- Audit every retained staff and guest surface against the real task it serves:
  what the operator is doing, on which device, under what interruption, and how
  many taps it currently costs. Record findings before redesigning; a page with
  no measured problem does not need a redesign.
- Absorb the mobile-first staff audit into this stage. Host, bartender, server,
  inventory-count, and manager tasks are judged on taps, latency, one-handed
  use, interruption recovery, and accessibility during live service.
- Settle the design system before applying it. Promote
  [`DESIGN.md`](DESIGN.md) from a description of what exists into the committed
  contract: tokens, type scale, spacing, density, operational status treatment,
  empty/loading/error/module-disabled states, and the responsive breakpoints.
  Every screen then derives from that contract instead of inventing locally.
- Consolidate the component layer so one shared, documented primitive set backs
  every surface, and so stage 11 can reuse the same contract on a second
  client. Delete one-off variants as they are replaced; do not maintain two
  design languages during the pass.
- Do a copy and naming pass across staff surfaces: rename ML Insights to
  operator-legible language, keep the **settled externally** vocabulary exact,
  never call an uncollected total revenue, and keep empty and failure states
  honest rather than decorative.
- Re-verify accessibility, reduced-motion, keyboard operation, contrast, and
  responsive behavior after the pass, not before it.
- Keep the area-based Floor board unless the audit produces evidence against
  it. Geometry and drag-and-drop remain a separate later decision.
### 7a. Backend gaps the rev-3 design assumes — surfaced by the stage 7 port

The design canvases assume operational state the backend does not supply.
Stage 7 is a presentation stage and does not add features, so each of these
ships **honest** rather than simulated, and lands here with its trigger.
`docs/DESIGN.md` carries the same table next to the severity rank it affects.

- **Ticket target time.** `Order` has `placed_at` and a `status_timeline`, so
  ticket *age* is computable, but nothing configures a target: no field on
  `PreparationStation`, no business setting. Age therefore renders as a neutral
  figure and the ageing rank cannot be applied. **This removes one of the four
  exhaustive critical cases.** *Trigger:* a pilot venue states a service
  standard it wants boards to hold to.
- **Per-party quoted wait.** `queue_service.measured_wait_estimate` is a live
  board-level median; `QueueEntry` stores no quote-at-join, and the quote moves
  during service. Comparing a party's wait to the board's *current* estimate is
  a different claim, so it is not made. **Removes a second critical case.**
  *Trigger:* the queue needs to answer "is this guest past what we promised
  them".
- **Offline outbox.** The four socket hooks now report `connected` and
  `lastContactAt`, so the offline bar shows real time-since-contact. There is
  no local queue of work held while disconnected, so the bar omits the "held on
  this device" count rather than inventing it. *Trigger:* staff devices need to
  keep taking orders through a drop.
- **"Right now" activity feed.** No live event feed exists.
  `reporting_service.staff_actions` is a range report and is deliberately not a
  general audit log — a platform-wide audit explorer is already deferred
  post-MVP in `docs/PRODUCT.md`. The Overview feed panel ships empty or is
  composed only from existing endpoints. *Trigger:* the audit explorer is
  scheduled, or the overview is judged unusable without it.
- **"Close the night".** No service-day close action exists anywhere in
  `server/app/`. The sidebar-foot control and its dialog are not built.
  *Trigger:* a pilot venue needs the night's figures written and boards stopped
  as one action.
- **Trial countdown.** No subscription or trial model on `Business`; omitted
  from the zero state. *Trigger:* commercial terms exist.
- **First-sign-in orientation panel.** No per-staff "seen orientation" flag.
  *Trigger:* onboarding evidence says new staff need it.
- **Account lockout and attempts remaining.** The Auth canvas's credential
  ladder names attempts left and then locks the account for 15 minutes. There is
  no lockout model: `auth_login_identity` in `server/app/core/rate_limit.py` is a
  10-per-10-minute limit keyed on IP plus email, and a 401 carries no counter.
  The sign-in screen ships rungs 1 and 2 (generic failure, then reveal the
  password) and the locked rung against the real 429, counting down from the
  server's own `Retry-After`. **"Two attempts left" is not shown** — the client
  does not hold that counter, and a wrong number told to someone under pressure
  is worse than none. *Trigger:* a venue reports credential-stuffing, or the
  ladder is judged incomplete without the count.
- **"Keep me signed in on this device".** The canvas puts this checkbox on its
  own 44px row. `setTokenCookie` always issues a 7-day cookie, so the control
  would change nothing. It is not rendered. *Trigger:* the session length needs
  to differ between a shared bar laptop and a personal device — which is the
  real reason to want it.
- **Menu import.** The canvas's register panel and landing FAQ both said "upload
  the menu as a spreadsheet". No import endpoint exists; the menu is entered in
  the menu editor. Both copies were corrected. *Trigger:* onboarding evidence
  says typing a full menu is the thing that stalls a new venue.
- **Ticket printers.** The canvas's hardware FAQ said "ticket printers still
  work if you want them". There is no printer integration anywhere. The claim
  was removed. *Trigger:* a pilot venue will not drop its printer.
- **Password reset expiry time.** The canvas's sent state names the wall-clock
  expiry ("the link expires at 20:24"). `forgot-password` returns nothing about
  the token, so the screen states the window ("works for one hour") instead.
  *Trigger:* the endpoint returns an expiry.

Consequence worth stating plainly: **three of the four exhaustive critical
cases are not currently derivable.** Only "a live board that has lost its
connection" is. Critical therefore appears on very few surfaces until targets
and quotes exist. That is the correct honest outcome of the rank, not a defect
in the port.

### 7b. Open design questions from the rev-3 port

Raised rather than answered locally, per rule zero — a value that is needed and
missing is a design question, not an implementation choice.

- **Per-tenant service-type colours.** A venue picks a colour for each service
  type from a fixed palette of twelve arbitrary hues in
  `client/components/color-picker.tsx`. Nothing in the token block governs them,
  and they surface on the schedule and (until this port) as a dot beside every
  booking. The dot is gone — it was a second status object competing with the
  badge — but the colours are still stored and still shown on the schedule.
  This is the same question as the chart palette: either the system declares a
  categorical set, or per-tenant colour leaves the product. *Trigger:* the chart
  palette question is answered.
- **Categorical chart palette.** `crowbar-tokens.css` declares no multi-series
  chart colours. `/business/insights` renders five guest segments and several
  multi-series bars on raw Tailwind hex. `--chart-1..5` are aliased to brand
  plus the neutral ramp as a provisional stand-in; Insights' own series colours
  are held on raw hex as the one documented exception to the raw-hex check.
- **Phone.** The product is designed at 1280+ and 1024×768 only. Stage 7's exit
  gate below requires each pilot role to complete its core task on a phone
  during service; there is no phone canvas, so **that clause is currently
  unmet** and is carried here deliberately rather than quietly dropped.
- **440px side-panel breakpoint.** Stated in §06 prose but absent from the token
  block; used as an arbitrary variant in `components/ui/sheet.tsx`.
- **`--field-invalid-ink` (`#D98B78`).** Added during the port because
  `--field-invalid` measured 1.84:1 on ink and had no dark-ground pair, while
  the product has forms on dark surfaces. Confirm it lands in the canonical
  `crowbar-tokens.css` so the design file and the codebase do not diverge.
- **Password strength and the attend colour.** The Auth canvas's notes say
  "amber is a password that isn't strong enough yet". §08 of the System canvas
  puts exactly that case on the form-validation channel instead — "'Too short —
  10 characters minimum' is this, not attend". The two boards disagree, and §08
  governs, so the strength meter uses the validation colour and a neutral, never
  attend: a password hint must not read as a service alarm. Confirm which board
  is authoritative.
- **Password minimum: 10 or 12.** The canvas says 10 characters throughout;
  `PASSWORD_MIN_LENGTH` and the server both enforce 12. The screens ship 12,
  because a form promising a laxer rule than the API fails at submit instead of
  at the field. Align the canvas or the server.
- **Marketing measurements outside the token block.** The Landing canvas uses 31
  distinct `clamp()` expressions and a set of editorial type sizes (14.5, 15.5,
  16.5, 19, 20, 22px) that sit between the ten declared steps. They are
  transcribed verbatim into a marketing layer in `client/app/globals.css` rather
  than inlined, so nothing enters the codebase that the design did not set — but
  they are not tokens, and the marketing surface is the one place where sizes
  live outside `:root`. Confirm this is intended, or promote them.
- **Terms, privacy and Impressum.** The canvas footer links all three; the
  product has terms only as a dialog inside registration, and no privacy or
  Impressum page. The links are not rendered rather than pointing nowhere. A
  German GmbH operating a public site will need at least an Impressum.
- **`bar_kitchen` navigation breadth.** The States canvas shows a bartender with
  a three-item nav; the real role also holds `customers.view`, `floor.view`,
  `queue.view`, `reservations.view`, `menu.edit` and `overview.view`. The nav
  renders from the real capability matrix. Narrowing the role is a stage-6
  permissions change, not a design one.

- **Exit gate:** every retained surface follows one documented design contract,
  each pilot role can complete its core task on a phone during service, no
  screen carries a placeholder or dishonest state, and no functional behavior
  changed without being recorded as its own item.

### 8. Demo environment and local release gate — ready after stage 7

- Expand the canonical demo tenant with areas, tables, combinations, current
  and future reservations, offer-ready waitlist, active queue, open seating and
  tab, kitchen/bar orders, externally settled history, recipes, stock risks,
  suppliers, purchase orders, stock counts, cost/margin examples, guest
  profiles, and printable table QR sheets. Role-limited staff ship as of stage
  6 — the seed carries one account per role.
- Automate the critical browser journey: book → assign/seat → QR/staff order →
  fulfill → deduct/reconcile stock → record waste → settle externally → close
  seating → inspect guest and cost history.
- Add repository CI for frontend lint/test/build, PostgreSQL tests, fresh
  migrations/seed, ML import/tests, documentation links, dependency/secret
  scanning, and deterministic browser smoke tests. Add accessibility,
  responsive, failure-mode, and relevant load/concurrency checks.
- Exercise loss of email, SMS, Redis, WebSocket, ML, and reconnect paths; prove
  optional-service failures do not corrupt the core operational record.
- **Exit gate:** no visible placeholder/dead interaction or known P0/P1 defect;
  every core journey passes locally from a fresh database on the supported
  device/browser matrix; the demo can be reset reproducibly without destructive
  production tooling.

### 9. Railway deployment — blocked on stages 0–8 and explicit authorization

- Resume the existing Railway project only after the local release gate passes
  and the user explicitly authorizes deployment work. Reconcile the preserved
  migrations 001–022 environment with all local migrations and code first.
- Deploy public web/API and private PostgreSQL, Redis, optional ML, reminder and
  retention jobs, and durable object storage. Configure German/EU hosting,
  domains, TLS, CORS, secrets, rate limiting, and private service networking.
- Add staging/pilot separation, pre-deploy migrations, release provenance,
  health/readiness checks, smoke tests, monitoring, job/delivery alerts,
  backup/restore proof, rollback/recovery, and a manual production gate.
- Keep a single API replica until shared WebSocket fan-out is designed, or add
  that design before scaling horizontally.
- **Exit gate:** the exact locally accepted build runs in a recoverable,
  observable Railway environment and passes post-deploy critical journeys.

### 10. Supervised pilot rollout — ready after stage 9

- Introduce the venue in controlled steps: configuration/demo data;
  reservations/queue/floor alongside the incumbent process; ordering and
  external settlement; observed inventory deductions; then purchasing and
  stock counts after reconciliation proves accurate.
- Preserve the existing compliant register as fiscal/payment authority for the
  whole MVP pilot. Document staff fallback, data correction, support ownership,
  incident escalation, and rollback for each activated workflow.
- Measure task completion, error/recovery, latency, stock reconciliation,
  adoption, and operator feedback by workflow. Resolve pilot defects before
  expanding dependence or promising new modules.
- **Exit gate:** the venue can run the agreed operational loop under supervision
  with reconciled data, trained staff, documented fallback, and no unresolved
  high-risk defect.

### 11. Mobile app on the shared design system — ready after stage 10

Deferred until the pilot proves the workflows and the redesign settles the
design contract. Building a second client before either is stable duplicates
churn across two codebases.

- **Needs decision — audience and technology:** Staff shift operations, owner
  analytics, and guest booking/ordering are three different products. Pick one
  first, then compare a stronger responsive web/PWA against React Native, Expo,
  and Flutter on offline behavior, push notifications, camera/QR, background
  work, distribution, and team capacity. An installable PWA is the honest
  baseline the native options must beat.
- Reuse the stage 7 design contract rather than reinterpreting it: same tokens,
  type scale, status treatment, and vocabulary, adapted to platform-native
  navigation and touch targets instead of copied pixel for pixel.
- Reuse the existing API, authentication, entitlement, and module boundaries.
  Do not add a mobile-only backend, a second ordering path, or a parallel
  booking engine.
- Define the offline contract before building: which views stay readable, which
  writes may queue, how staff see stale state, and how conflicts reconcile.
  Do not promise generic "offline mode" without per-operation safety rules.
- Decide push notification ownership, device/session revocation, store
  distribution, and release cadence alongside the web release process.
- **Exit gate:** the chosen audience can complete its core journey on the app
  with the same authority, tenancy, and vocabulary guarantees as the web
  client, and the design reads as the same product.

### Post-MVP: German fiscal POS, payments, and broader platform work — deferred

- Treat German cash-register compliance as a separate program: legal/tax
  review, TSE, DSFinV-K, immutable fiscal transactions, receipt obligation,
  cash drawer, terminals/processors, tips, split/partial tenders, refunds,
  deposits/card holds, reconciliation/payouts, audit export, hardware support,
  and offline fiscal behavior.
- Add jurisdiction-specific compound/stacked taxes, tax-on-tax rules, cash
  rounding, filing categories/returns, fiscal invoices, exemption evidence,
  country-maintained legal preset catalogues, and automatic product
  classification only after jurisdictional review. The MVP's manual profiles
  deliberately make none of those claims.
- Add full UI/content translation and locale negotiation separately from the
  shipped formatting locale. English product copy is the MVP contract.
- Design an explicit currency-migration/repricing workflow before allowing an
  established tenant with priced or monetary history to change currency; do
  not reinterpret historical amounts in place.
- Evaluate delivery marketplaces, loyalty/marketing, reviews, workforce
  scheduling/time clock/payroll exports, native apps, multi-location
  management, full customizable RBAC/audit, accounting integrations, and
  broader DASH replacement only after pilot evidence reprioritizes them.

## Completed Foundations Carried into the MVP

The following completed local stages remain useful evidence and must not be
mistaken for the new MVP exit gate. They predate the 2026-08-13 supervised-pilot
roadmap and feed its stages 1–8.

### Authoritative availability and capacity — complete

- **Complete — local data foundation:** Migration 023 adds one
  business booking schedule plus optional complete service-type overrides,
  multiple/overnight weekly windows, date closures/custom hours, policy
  settings, non-null positive concurrency, persisted reservation end times,
  and override-audit fields. Existing operating hours seed initial defaults;
  missing hours produce a closed schedule. ORM, Pydantic, seed, and focused
  PostgreSQL tests are aligned. This migration is not deployed while the
  Railway rollout is paused.
- **Complete — availability creation slice:** One server-authoritative
  availability service now powers the public read contract plus public and
  authenticated reservation creation. It resolves business-default or complete
  service overrides and is the extension point for future bots and table
  assignment.
- **Complete — enforced booking rules:** The backend enforces business
  timezone, multiple/overnight windows, service-date-anchored exceptions,
  minimum notice, advance horizon, slot interval, party size, duration, and
  concurrency. Pending and confirmed reservations consume capacity;
  cancellation releases it. The read API returns only bookable absolute
  start/end slots without occupancy counts.
- **Complete — race-safe creation:** Creation locks the resolved schedule row,
  rechecks the requested server-produced slot in the transaction, persists its
  occupied interval, commits before event publication, and returns a structured
  409 with up to five alternatives when stale. New businesses start closed.
- **Complete — public booking UI:** Guests choose live server-returned slots,
  see venue-local times, submit the exact absolute timestamp, and can recover
  from a slot conflict by choosing a returned alternative. Party choices are
  capped by both business and service settings.
- **Complete — schedule management:** Authenticated staff can view the business
  default and complete service-type overrides. Owners/managers can edit policy,
  split/overnight weekly windows, and closed/custom date exceptions; create an
  override from the current default; or delete it to resume inheritance after
  confirmation. A previewed one-time operating-hours copy replaces only the
  default weekly windows and preserves policy/exceptions. The Booking Types UI
  now exposes positive concurrency, and ordinary staff remain read-only.
- **Complete — atomic staff rescheduling:** Future pending and confirmed
  reservations move through a dedicated authenticated command. Staff select
  only server-returned venue-timezone slots; the transaction locks the
  reservation and resolved schedule, excludes the reservation being moved,
  and preserves its old interval if the new claim fails. Booking type, party
  size, start, end, reminder state, notifications, updated email/ICS, SMS, and
  the post-commit event move together. Generic PATCH rejects allocation fields,
  and cancelled, completed, or past reservations cannot be moved.
- **Complete — staff booking and availability overrides:** Reservations and
  Schedule expose one shared New Reservation flow, while creation and moves
  use tenant-derived authenticated availability. Ordinary staff select normal
  server slots only. Owners/managers can enter an explicit override mode with
  server-generated venue-timezone times and a required reason; it may bypass
  hours, exceptions, notice/horizon, and concurrency, but not tenant/module,
  future-time, service, interval, or party-size constraints. Actor, reason, and
  timestamp are visible on the reservation, and staff notifications identify
  the exception. The authenticated create contract no longer accepts a
  browser-supplied business ID.
- **Complete — clarified field ownership:** `businesses.max_guests` and
  `service_types.capacity` cap party size; resource policy owns table or cover
  availability, while `max_concurrent_bookings` is an optional operational
  booking-count guard;
  service duration overrides the schedule default; schedule interval, notice,
  and horizon own slot generation; operating hours remain public venue
  information.
- **Complete — public booking access control:** Owners/managers can make a
  business public-booking or staff-only without disabling staff reservations,
  table planning, or seatings. Public availability and creation enforce the
  business-level setting; public guests see a contact-the-venue state when it
  is off. Existing businesses remain enabled through the migration backfill.
- **Complete — resource-aware availability:** Migration 027 keeps existing
  booking types on their legacy count guard until a manager configures a policy.
  New types may consume shared reservable covers or atomically auto-allocate
  the smallest eligible table/configured combination. Public/staff creation and
  rescheduling reuse the same resource checks; exact turn-buffer boundaries are
  valid. Onboarding asks how the first service holds capacity.

### Floor plan and table management — complete

- **Complete — operational domain contract and backend foundation:** Every
  business has a primary-location lifecycle. Areas own registered tables with
  capacity, shape, ordering, and `ready` / `cleaning` / `out_of_service`
  conditions. Multi-table allocations must match an active configured
  combination. Reservation and queue assignments are separate from actual
  seatings; closing a seating completes the visit and returns tables to ready
  by default. “Cleaning” is an optional needs-reset state. Capacity is enforced unless an owner/manager records an override
  reason. Configuration is owner/manager-only while all staff can operate
  table state, assignments, and seatings.
- **Complete — authoritative host-board backend:** Migration 025 adds a
  configurable business-local service-day cutoff, defaulting to 05:00. One
  tenant- and location-scoped HTTP projection returns areas, table display
  state, current/next assignments, open seatings, unassigned reservations, and
  active queue parties for the resolved service day. Assignment read/remove
  commands are available, new reservation/queue records use the primary
  location, and all floor-plan mutations commit before publishing invalidation
  events. Staff WebSockets use short-lived business-bound credentials and only
  invalidate the board; HTTP remains the authoritative fallback.
- **Complete — host service board and management UI:** The authenticated
  Floor workspace now consumes the authoritative board with responsive
  area/table cards, unassigned reservations, queue parties, occupied,
  cleaning, temporary-closure, and availability actions. Its shared table
  selector creates real seatings, and the Queue page now uses it instead of the
  removed table-less accept/seat commands. Owners/managers configure areas,
  tables, combinations, and service-day cutoff. Reservations and Schedule
  details now expose planned assignment, reassignment, and removal through the
  same table selector. Focused integration coverage validates the service loop,
  including planning a later reservation on an occupied table and returning it
  to ready when the current seating closes.
- **Complete — ordering and tab continuity:** Migration 028 keeps historical
  free-text order labels read-only while new public dine-in orders require an
  opaque, revisioned credential for a registered table. The server validates
  the credential, active table, tenant, and active seating; QR and staff rounds
  share the seating's sole open tab. Owners/managers can rotate a table link,
  while Floor starts/opens tabs and requires tab closure before departure. The
  current closure field is simulated and will become the explicit external-
  settlement record in MVP stage 4.
- **Deferred within this stage — visual editor and richer service stages:** Add
  drag-and-drop geometry, turn-time assistance, and richer meal stages only
  after the area-based service loop is proven. Crowbar-owned stages must not
  depend on a future POS; orders or integrations may later enrich stages such
  as ordered, mains, dessert, check requested, and externally settled.

### Rich guest CRM — complete foundation

- **Complete — business-scoped guest CRM:** Migration 029 expands the existing
  phone-keyed identity with a dedicated staff profile and authoritative
  reservation, queue, tab, order, and team-note timeline. Queue joins with a
  phone now attach to the identity. Staff record optional DOB, preferences,
  guest-provided dietary details, tags, and authored notes; Floor presents
  dietary details and tags as passive arrival context. Public reservation
  confirmation captures separate unchecked email/SMS marketing choices. Owners
  and managers can merge, export, correct, and anonymise profiles; the
  one-shot retention job applies the default 24-month inactivity policy.
- **Deferred — production privacy operations:** Obtain legal review of the
  EU/Germany-facing privacy notice and processor terms, configure venue privacy
  contacts and a production schedule for the retention job, and add guest-led
  self-service access/withdrawal flows before marketing automation or external
  data sharing.

### No-show and reservation protection — complete foundation

- **Complete — configurable, non-monetary protection:** Booking schedules own
  business-default and booking-type replacement policies for late changes,
  arrival grace, reminders, and optional reconfirmation. Secure guest links
  allow cancellation, reconfirmation, and atomic rescheduling before arrival;
  staff record no-shows after grace; a future waitlist supports one guest, one
  15-minute offer, and an atomic acceptance recheck. Guests can join from a
  fully booked date with a preferred-time flexibility window; staff can add,
  review, and offer only live slots inside that window.
- **Deferred beyond MVP:** Deposits, card holds, fees, blacklists, and automatic
  punitive action remain part of the post-MVP fiscal POS/payment program.

All other product plans remain active below, but their implementation follows
the confirmed sequence unless a stage explicitly pulls the item forward.

## Documentation Transition

- **Ready:** Reconcile `README.md` with current manifests and routes. It is a
  useful quick start, but endpoint inventory and some narrative details drift
  as features evolve.
- **Ready:** Reconcile environment examples with every supported mode,
  including frontend mock mode and production CORS configuration.
- **Complete — 2026-08-25:** `docs/backlog.md`, `docs/README.md`,
  `docs/PORTABLE_AGENT_SETUP.md`, `docs/plans/`, and root `reminders.txt` were
  removed after every unresolved entry was reconciled into this file. `AGENTS.md`
  is now the only document ownership map and reading order.
- **Ready:** Add nested `AGENTS.md` files only when client, server, or ML work
  develops genuinely different recurring instructions. Avoid duplicating the
  root guide.
- **Deferred — additional agent skills:** [`SKILLS.md`](SKILLS.md) lists the
  named candidates and the bar for writing one. None is scheduled; the trigger
  is repeated real friction in that workflow, not completeness of the list.

## Product and UX

- **Ready:** Audit both planned enhancements and established workflows for
  unnecessary staff friction or speculative state. Prefer the smallest useful
  operational cue over mandatory acknowledgements, repeated confirmation, or
  lifecycle states that do not save a bartender, host, or manager time. Record
  which controls are removed, made optional, or retained with an observed
  service rationale.
- **Complete — initial customer profile:** The first target is a
  single-location bar in Germany entering a supervised pilot. The MVP wedge is
  the non-fiscal operational loop—reservations, queue, tables, orders, stock,
  purchasing, cost, and guest context—while a separate compliant register
  remains payment/fiscal authority.
- **Needs decision:** Design a cross-module shift command center after its
  source workflows are authoritative. Combine today's reservations, queue,
  table state, open tabs, stock risks, no-show risk, demand, and material alerts
  into one prioritized service view rather than copying every dashboard.
- **Ready after source stages:** Add configurable pre-service and handover
  checklists populated by large parties, guest needs, expected covers,
  preparation risks, staffing gaps, and below-par items. Alerts should explain
  the action and deep-link to its owner workflow.
- **Ready — stages 0–1:** Optimize onboarding for early value through guided
  setup, opinionated venue templates, safe CSV/import tools, progress recovery,
  and a measurable path to first bookable service or first live menu. Do not
  require a venue to model its entire operation before receiving value.
- **Needs decision:** Add lightweight loyalty and consented retention
  automation only after the CRM contract exists: birthday/regular recognition,
  post-visit thanks, rebook nudges, and simple rewards. Measure incremental
  return visits and opt-outs rather than message volume.
- **Complete — stage 1:** `ContactDialog` and `FooterContactForm` were removed from
  retained MVP surfaces. Reintroduce them only with a real, abuse-protected
  delivery/support-triage path; they must not keep their false-success state.
- **Needs decision:** Review and approve the landing FAQ and pricing copy before
  treating it as published product messaging.
- **Needs decision:** Decide whether a booking type may attach a small set of
  venue-defined questions to a reservation (allergies, occasion, seating
  preference). The guest CRM already stores dietary notes, so confirm this is
  not a second overlapping capture path before designing it.
- **Complete — stage 6:** Every report takes an explicit range through a shared
  picker (`client/components/reports/report-range.tsx`) and echoes the window
  back beside the figure, so a number on screen always carries the period it
  covers. The Inventory cost-control panel, which hard-coded 28 days, uses the
  same picker.

## Testing and Quality

- **Ready — stages 0, 1, and 8:** Build the risk-based acceptance matrix and
  use unit, PostgreSQL integration, contract, end-to-end, visual,
  accessibility, performance, security, concurrency, failure, and migration
  tests according to blast radius and invariant ownership.
- **Ready:** Expand frontend tests beyond the current focused Vitest and MSW
  coverage, especially for ordering, reservations, module gates, money/time
  mapping, error states, and HTTP/WebSocket mapper parity.
- **Ready:** Expand PostgreSQL-backed backend integration coverage for every
  module, tenant isolation, roles, public endpoint abuse cases, idempotency,
  legal state transitions, and inventory ledger effects.
- **Ready — stage 8:** Use Playwright for the small critical browser-journey
  suite unless implementation discovery finds a repository-specific blocker;
  retain Vitest/Testing Library for component and mapper behavior.
- **Ready:** Add migration-chain tests against a fresh database in addition to
  ORM-metadata tests, including seed validation and a reliable disposable reset
  path.
- **Ready:** Add ML unit, pipeline, minimum-data, reproducibility, and
  leakage-regression tests.
- **Ready:** Establish accessibility checks, responsive/visual regression,
  performance budgets, and failure-mode tests for critical flows.
- **Ready — maintenance:** Upgrade or replace `python-jose` before Python
  removes `datetime.utcnow()`, migrate Next.js `middleware` to the supported
  `proxy` convention, and revisit Node/Vitest runtime deprecation warnings.
  These warnings are currently dependency/framework-owned and did not fail the
  Stage 1 gate.

## CI/CD

- **Ready:** Add a simple pull-request CI pipeline: frontend lint/test/build;
  backend tests with PostgreSQL; fresh-database migrations; ML import/tests;
  and documentation/link checks.
- **Ready:** Add dependency, secret, and vulnerability scanning with actionable
  failure policies rather than noisy report-only tooling.
- **Needs decision:** Choose branch protection and required checks, including
  whether expensive end-to-end or performance suites run per pull request,
  nightly, or before release.
- **Deferred:** Add a simple CD pipeline when the deployment arc resumes.
  Include staging, environment-specific configuration, migration ordering,
  health checks, smoke tests, rollback, and a manual production gate until
  releases are proven routine.
- **Ready:** Make releases traceable to a commit and preserve deploy, migration,
  worker, and model versions in operational metadata.

## Deployment

- **Blocked on stages 0–8 and explicit authorization — Railway rollout:**
  Deployment is intentionally paused while local MVP development and
  verification continue. In project
  `crowbar`, private PostgreSQL, private Redis, and the public FastAPI service
  are online in EU West. API health, database connectivity, migrations 001–022,
  and the Redis stream consumer were verified. Do not resume external changes
  without an explicit user request.
- **Ready after the local gate — resume point:** Deploy and enable the local
  FastAPI rate-limit change; then add public Next.js plus private ML, scheduled
  reminders, and durable object storage. Reconcile reference variables,
  secrets, the web domain, CORS, private ML connectivity, and end-to-end smoke
  tests as each service is added.
- **Ready after the local gate — production hardening:** Add backup/restore
  testing, migration rollout and rollback procedures, secret management,
  restricted service networking, durable uploads, health checks, monitoring,
  and release automation when the deployment arc resumes.
- **Ready:** Repair or remove the documented `python -m db.migrate reset`
  workflow. Its drop list predates many current tables, so it is destructive
  without being a reliable full reset.
- **Deferred:** Design multi-replica WebSocket fan-out before scaling the API
  beyond one replica. Current connection managers live in one FastAPI process.

## Security and Reliability

- **Complete — stage 1 deployment boundary:** Reservation pages default to
  `frame-ancestors 'self'`; operators may configure exact HTTP(S) origins with
  `RESERVATION_FRAME_ANCESTORS`, and wildcard values are rejected. A future
  per-business allowlist remains optional breadth.
- **Complete — stage 6:** FastAPI snapshots each successful Insights read into
  `ml_result_snapshots` (migration 049) and serves the snapshot marked
  `stale: true` with its capture time when the ML service is unreachable, so a
  restart degrades the dashboard visibly instead of emptying it.
- **Ready:** Complete abuse controls for the Next.js docs assistant and
  evaluate whether an edge/WAF layer is warranted. FastAPI now has local,
  Redis-backed rolling-window limits for auth, public reservation, queue,
  ordering, and related public reads. Deploying them and verifying Railway
  proxy/IP behavior remain part of the paused deployment arc.
- **Ready:** Decide whether Redis event delivery needs a transactional outbox,
  dead-letter handling, replay tools, and metrics. Publishing is currently
  best-effort.
- **In progress:** Reservation creation now commits the reservation and
  notification rows before event publication. Apply the same ordering to
  reservation update/delete, or solve it with an outbox, before adding
  consumers for those event types.
- **Ready:** Add scheduled-job failure alerting and delivery reconciliation for
  the hourly reservation-reminder cron.
- **Ready:** Add structured tracing, metrics, SLOs, alerting, and request/event
  correlation beyond current request logs.
- **Complete — stage 1:** A shared business-route guard plus server page guards
  enforce onboarding across retained business routes.

## Product Architecture

- **Needs decision:** Design privacy-preserving shared learning across tenants.
  Start with anonymous venue-level operational aggregates rather than
  cross-tenant customer profiles. Define the approved feature allowlist,
  purpose and legal basis, anonymization/reidentification tests, minimum cohort
  sizes, differential-privacy needs, retention/deletion handling, model
  lineage, tenant transparency or opt-in, and fairness evaluation before using
  any shared training dataset. Pseudonymized or hashed identifiers alone do
  not make personal data anonymous.
- **Ready — stage 4:** Replace hard-coded `kitchen | bar | any` routing tags
  with tenant-configurable preparation stations.
- **Complete — stage 6:** The fixed five-role capability matrix ships in
  `server/app/core/permissions.py`, mirrored to `client/lib/permissions.ts` and
  documented route-by-route in [`permission-matrix.md`](permission-matrix.md).
- **Needs decision — tenant-configurable RBAC.** Evaluate whether a venue owner
  should be able to define their own roles and capability sets rather than
  living with the fixed five. This is an evaluation, not an agreed feature: the
  question to answer first is whether a real pilot venue actually wants a sixth
  role, or whether the five cover the jobs a bar staffs. If they do, the
  evaluation must cover where a tenant-defined matrix is stored and validated,
  how a capability is retired without silently widening access, whether a
  tenant can grant a capability its own role does not hold, how the frontend
  mirror stays correct when the map is no longer compile-time, what the
  migration path is for venues on the fixed matrix, and what an operator sees
  when they lock themselves out. The current design is deliberately hostile to
  this — the map is a frozen module with an import-time well-formedness check —
  so treat a positive answer as a rewrite of the authorization layer, not an
  extension of it. **Trigger:** a pilot venue asks for a role the fixed five do
  not cover, twice.
- **Deferred — platform-wide audit explorer.** Stage 6 reports over the actor
  columns that already exist rather than introducing an audit-event table,
  because a general log would mean a second write path on every mutation for a
  reporting convenience. **Trigger:** an incident that the existing actor
  columns cannot reconstruct.
- **Needs decision:** Design active context for dual-role or multi-business
  accounts before changing the one-business tenancy assumption.
- **Deferred:** Multi-location management and location filtering UI. The
  floor-plan stage stays location-ready but does not pull this scope forward.
- **Deferred — inventory location transfers.** Migrations 046 and 047 hold the
  transfer schema and the ORM models remain mapped and documented as dormant,
  but no route reaches them. The pilot runs one location, no endpoint creates a
  second one, and `inventory_items.location_id` is nullable with one row per
  item rather than one per (item, location), so a transfer could never move an
  ordinary item. **Trigger:** the venue actually runs a second stockroom. That
  work starts with location CRUD and per-location stock identity, not with the
  transfer routes.
- **Deferred — S3 attachment storage.** Purchase-order attachments ship against
  `LocalStorageService`, so uploaded delivery notes live on the container disk
  and do not survive a restart. `S3StorageService` still raises
  `NotImplementedError`. **Trigger:** any deployment that must retain
  attachments — implement S3 before relying on them off a single host.
- **Ready:** Replace the sidebar queue-count poll with shared real-time state
  when the queue socket is lifted into a common provider.
- **Ready — stage 4:** Add real-time tab updates; tab detail is currently
  refresh-driven.
- **Deferred:** Public servings/pours display and stronger ID verification.
  Registered tables move into operational-loop stage 2.
- **Deferred beyond MVP:** Reviews, customer payment processing, German fiscal
  register work, and Crowbar subscription billing. Payment packages and current
  payment product paths are absent from the MVP.

## Workforce Operations

- **Needs decision:** After the operational loop, evaluate a focused workforce
  module: staff availability, scheduling, time clock, shift swaps, call-out
  coverage, role/station requirements, and forecasted labor needs. Confirm the
  target venue's existing scheduling stack before replacing it.
- **Needs decision:** Combine worked hours with POS sales, covers, waste, comps,
  and purchasing data for a simple shift contribution view. Keep it an
  operational explanation of "did this shift make money?", not uncertified
  accounting or payroll.
- **Ready after decision:** Export approved hours, roles, tips, and adjustments
  to payroll providers instead of building payroll, tax filing, or employee
  benefits into Crowbar.

## Client Applications

- **Mobile app — owned by stage 11.** The audience and technology decision,
  design reuse, offline contract, and API reuse rules live there; do not open a
  parallel mobile plan here.
- **Needs decision — Desktop app:** Identify desktop-specific workflows before
  wrapping the web app. Compare an installable PWA with Tauri or Electron based
  on offline resilience, kitchen/bar display mode, receipt printers, cash
  drawers, local networking, automatic updates, kiosk operation, and OS
  integration.
- **Needs decision:** Define a shared API, authentication, entitlement,
  observability, release, and design-system strategy across web, mobile, and
  desktop without forcing every client into identical interaction patterns.
- **Deferred beyond MVP, with graceful degradation required in stage 8:**
  Define an offline survival contract for live service:
  which queue, table, order, and inventory views remain readable; which writes
  may queue locally; how staff see stale state; and how conflicts reconcile
  after connectivity returns. Do not promise generic "offline mode" without
  per-operation safety rules.
- **Mobile-first staff operation — owned by stage 7.** Treating it as a
  measurable workflow requirement is independent of whether a native app is
  ever chosen; the audit runs in the redesign pass.

## Conversational AI

- **Needs decision — WhatsApp reservation bot:** Let customers discover
  availability and create, confirm, change, or cancel reservations through a
  WhatsApp conversation. Decide whether Twilio WhatsApp or Meta's Cloud API is
  the initial transport and whether the first release is deterministic,
  AI-assisted, or fully tool-calling.
- **Ready:** Reuse the existing reservation, customer-identity, notification,
  channel, and idempotency paths rather than creating a second booking engine.
  Use the existing `bot_configs` and `bot_enabled` foundations only after
  verifying they fit the agreed conversation model.
- **Needs decision:** Design explicit confirmation before writes, business and
  location resolution, human handoff, unsupported-request recovery,
  multilingual behavior, message-window/template rules, opt-in/opt-out,
  transcript retention, deletion, and staff visibility.
- **Ready:** Threat-model prompt injection, impersonation, duplicate webhook
  delivery, replay, stale availability, PII exposure, unsafe tool calls,
  provider outages, cost spikes, and hallucinated policies. The model must
  never invent availability, pricing, booking status, or business rules.
- **Ready:** Build conversation simulations and evaluation sets for successful
  booking, ambiguity, corrections, cancellations, no availability, abusive
  input, provider retry, and human escalation before production rollout.
- **Deferred:** Generalize the channel adapter to Instagram, web chat, SMS, or
  voice only after the WhatsApp workflow and operational model are validated.
- **Ready:** WhatsApp as an outbound reservation-notification channel is a
  smaller, separable step from the bot. The `notification_channels` JSONB
  column on businesses already accepts additional channel values, so adding
  `"whatsapp"` is backward compatible and does not require the conversational
  model to be settled first.

## Data and ML

- **Ready within stages 5–6:** Attach waste/loss analysis, reorder suggestions,
  and richer operational forecasting to purchasing and cost-control actions
  rather than building isolated predictions. ML remains optional for the pilot.
- **Complete — stage 6:** Minimum-data floors, reproducibility, leakage and
  seeding rules are documented in `ml/CONTEXT.md` and asserted by
  `ml/tests/test_model_policy.py`. Latest results survive an ML restart through
  `ml_result_snapshots`.
- **Needs decision — nothing writes cancellation-risk predictions.**
  `analytics_service.get_high_risk_reservations` queries
  `model_name='cancellation'` / `entity_type='reservation'`, but the pipeline
  only ever persists `customer_segmentation` rows, so the endpoint returns an
  empty list for every tenant and always has. It now answers honestly rather
  than erroring, and the Insights panel shows an empty state. Decide whether
  per-reservation cancellation risk is worth persisting at all before building
  it: the model is trained and evaluated on every run, so the missing piece is
  storage plus a decision about what a manager does with a risk score.
  **Trigger:** a pilot venue with enough booking history to clear
  `MIN_TRAINING_SAMPLES` asks to act on no-show risk.
- **Ready:** Add model/data drift monitoring, minimum-data thresholds, model
  versioning, and scheduled pipeline execution.
- **Ready:** Review whether the ML service should retain write access only to
  its output tables through a restricted database role.
