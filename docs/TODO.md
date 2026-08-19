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
Stage 8 remains an external deployment action requiring separate user
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
  under `docs/` use the same 0–9 order, external-settlement language,
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
  stages 1–7. Later implementation closes those rows instead of creating a
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
  schema/relationship validity; stage 7 owns the richer scenario. Never use the
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

### 5. Finish stock, purchasing, and cost control — ready after stage 4

- Add supplier records, supplier products, lead times, purchase orders,
  approval/status flow, partial receiving, substitutions, discrepancies,
  delivery/invoice references, attachment metadata, and purchase-price history.
  Paying supplier invoices remains outside Crowbar.
- Add canonical pack and unit conversions across case, each, bottle, keg,
  kilogram, litre, and millilitre without creating a second inventory unit
  system. Keep the movement ledger authoritative.
- Add location transfers with in-transit/reconciliation semantics; stocktake
  and cycle-count sessions; counted-versus-book variance; bar-native
  open-bottle/tenthing and keg-level entry; reasoned shrinkage; and safe CSV
  import/export. Full offline counts remain post-MVP unless the pilot proves a
  hard need.
- Add inventory valuation, recipe cost, menu gross margin, pour cost,
  actual-versus-theoretical consumption, controllable COGS, waste/variance,
  cost-change alerts, and explainable reorder suggestions using par, forecast,
  open purchase orders, and lead time.
- Keep accounting exports provider-neutral and deferred until the first venue's
  accountant confirms the required German format and authority boundary.
- **Exit gate:** a manager can order, receive, count, reconcile, and explain
  stock and margin from one auditable ledger without entering or implying
  payment data.

### 6. Staff, CRM, and operational reporting — ready after stage 5

- Replace coarse operational access with a secure fixed MVP permission matrix:
  owner, manager, host/server, bar/kitchen, and inventory operator. Add shared-
  device PIN unlock/automatic lock only if the pilot hardware/workflow requires
  it; defer a tenant-custom permission builder.
- Complete the guest timeline across reservations, queue, tabs, and orders;
  guest-led data-request/withdrawal intake; consent suppression; privacy contact;
  scheduled retention; conservative merge; and venue-owned portable export.
  Defer automated marketing, loyalty, and review campaigns.
- Provide authoritative reports for reservations/covers/no-shows, queue wait
  and seating conversion, table utilization/turn time, ordered items/stations,
  open versus externally settled tabs, inventory movement and variance,
  purchasing cost, recipe cost, margin, waste, and staff actions/ticket timing.
  Add CSV/PDF where operationally useful, but not fiscal or accounting reports.
- Keep ML optional and failure-tolerant. Persist latest results and establish
  minimum-data, reproducibility, leakage, drift, version, and scheduling rules;
  do not let ML readiness block the core pilot.
- **Exit gate:** each pilot role sees only the data/actions it needs, managers
  can explain service and stock outcomes, and privacy operations are usable
  without marketing automation.

### 7. Demo environment and local release gate — ready after stage 6

- Expand the canonical demo tenant with areas, tables, combinations, current
  and future reservations, offer-ready waitlist, active queue, open seating and
  tab, kitchen/bar orders, externally settled history, recipes, stock risks,
  suppliers, purchase orders, stock counts, cost/margin examples, guest
  profiles, role-limited staff, and printable table QR sheets.
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

### 8. Railway deployment — blocked on stages 0–7 and explicit authorization

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

### 9. Supervised pilot rollout — ready after stage 8

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
roadmap and feed its stages 1–7.

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
- **In progress:** `docs/backlog.md` is explicitly a legacy ledger; its payment,
  staff-invitation, phone-normalization, and reminder entries are reconciled
  with the MVP boundary. Reconcile or retire the remaining historical entries
  instead of extending the file.
- **Ready:** Add nested `AGENTS.md` files only when client, server, or ML work
  develops genuinely different recurring instructions. Avoid duplicating the
  root guide.
- **Ready — deferred agent skills:** Nine skills are specified in
  [`SKILLS.md`](SKILLS.md) but not written: `change-crowbar-service-time`,
  `change-crowbar-inventory-ledger`, `change-crowbar-realtime`,
  `verify-crowbar-change`, `review-crowbar-shift-usability`,
  `shape-crowbar-product-change`, `experiment-crowbar-ml`, `release-crowbar`,
  and `record-crowbar-decision`. The first five were deferred on 2026-08-17
  rather than shipped thin; the last four were folded in on 2026-08-18 when
  `SKILLS.md` retired its overlapping candidate catalogue. `release-crowbar`
  additionally waits on the deployment arc resuming. The trigger for writing
  one is repeated real friction in that workflow, not completeness of the list.
  Each must be grounded in verified source paths, and must not duplicate an
  installed skill — check the division of labor in `SKILLS.md` first.

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

## Testing and Quality

- **Ready — stages 0, 1, and 7:** Build the risk-based acceptance matrix and
  use unit, PostgreSQL integration, contract, end-to-end, visual,
  accessibility, performance, security, concurrency, failure, and migration
  tests according to blast radius and invariant ownership.
- **Ready:** Expand frontend tests beyond the current focused Vitest and MSW
  coverage, especially for ordering, reservations, module gates, money/time
  mapping, error states, and HTTP/WebSocket mapper parity.
- **Ready:** Expand PostgreSQL-backed backend integration coverage for every
  module, tenant isolation, roles, public endpoint abuse cases, idempotency,
  legal state transitions, and inventory ledger effects.
- **Ready — stage 7:** Use Playwright for the small critical browser-journey
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

- **Blocked on stages 0–7 and explicit authorization — Railway rollout:**
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
- **Ready:** Persist tenant-scoped ML result summaries so an ML service restart
  does not empty the Insights dashboard until the next pipeline run.
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
- **Ready — stage 6 / deferred expansion:** Implement the confirmed fixed MVP
  permission matrix and audit security-sensitive actions in stage 6. A fully
  tenant-custom permission builder and platform-wide audit explorer remain
  post-MVP.
- **Needs decision:** Design active context for dual-role or multi-business
  accounts before changing the one-business tenancy assumption.
- **Deferred:** Multi-location management and location filtering UI. The
  floor-plan stage stays location-ready but does not pull this scope forward.
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

- **Needs decision — Mobile app:** Define the primary audience and native-only
  value before choosing technology. Staff shift operations, owner analytics,
  and customer booking/ordering are different products. Compare a stronger
  responsive web/PWA experience with React Native, Expo, Flutter, and native
  apps based on offline behavior, push notifications, camera/QR, background
  work, device integrations, distribution, and team capacity.
- **Needs decision — Desktop app:** Identify desktop-specific workflows before
  wrapping the web app. Compare an installable PWA with Tauri or Electron based
  on offline resilience, kitchen/bar display mode, receipt printers, cash
  drawers, local networking, automatic updates, kiosk operation, and OS
  integration.
- **Needs decision:** Define a shared API, authentication, entitlement,
  observability, release, and design-system strategy across web, mobile, and
  desktop without forcing every client into identical interaction patterns.
- **Deferred beyond MVP, with graceful degradation required in stage 7:**
  Define an offline survival contract for live service:
  which queue, table, order, and inventory views remain readable; which writes
  may queue locally; how staff see stale state; and how conflicts reconcile
  after connectivity returns. Do not promise generic "offline mode" without
  per-operation safety rules.
- **Ready — stage 7:** Treat mobile-first staff operation as a measurable
  workflow requirement now, independent of whether a native app is chosen
  later. Audit host, bartender, server, inventory-count, and manager tasks for
  taps, latency, one-handed use, interruption recovery, and accessibility
  during service.

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

## Data and ML

- **Ready within stages 5–6:** Attach waste/loss analysis, reorder suggestions,
  and richer operational forecasting to purchasing and cost-control actions
  rather than building isolated predictions. ML remains optional for the pilot.
- **Ready:** Establish reproducible training/evaluation artifacts and tests;
  current latest results are process-memory state backed by durable prediction
  tables.
- **Ready:** Add model/data drift monitoring, minimum-data thresholds, model
  versioning, and scheduled pipeline execution.
- **Ready:** Review whether the ML service should retain write access only to
  its output tables through a restricted database role.
