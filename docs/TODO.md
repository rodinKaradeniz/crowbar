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

## Active Product Sequence

The current product priority is to complete Crowbar's operational loop before
starting the broader planned improvements below. Work through these stages in
order unless the user explicitly reprioritizes them. A 2026-07-25 review of
operator-oriented product research reinforced this order and added the
dependency-aware workflow, adoption, workforce, offline, and integration items
below; it did not promote them ahead of the current availability stage.

### 1. Authoritative availability and capacity — complete

- **Complete — local data foundation:** Migration 023 adds one
  business booking schedule plus optional complete service-type overrides,
  multiple/overnight weekly windows, date closures/custom hours, policy
  settings, non-null positive concurrency, persisted reservation end times,
  and override-audit fields. Existing operating hours seed initial defaults;
  missing hours produce a closed schedule. ORM, Pydantic, seed, and focused
  PostgreSQL tests are aligned. This migration is not deployed while the
  Railway arc is shelved.
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

### 2. Floor plan and table management — complete

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
  while Floor starts/opens tabs and requires settlement before departure.
- **Deferred within this stage — visual editor and richer service stages:** Add
  drag-and-drop geometry, turn-time assistance, and richer meal stages only
  after the area-based service loop is proven. Crowbar-owned stages must not
  depend on a future POS; orders or integrations may later enrich stages such
  as ordered, mains, dessert, check requested, and paid.

### 3. Rich guest CRM

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

### 4. No-show and reservation protection

- **Complete — configurable, non-monetary protection:** Booking schedules own
  business-default and booking-type replacement policies for late changes,
  arrival grace, reminders, and optional reconfirmation. Secure guest links
  allow cancellation, reconfirmation, and atomic rescheduling before arrival;
  staff record no-shows after grace; a future waitlist supports one guest, one
  15-minute offer, and an atomic acceptance recheck. Guests can join from a
  fully booked date with a preferred-time flexibility window; staff can add,
  review, and offer only live slots inside that window.
- **Deferred within this stage:** Deposits, card holds, fees, blacklists, and
  automatic punitive action remain deferred to the confirmed POS/payment
  integration stage.

### 5. Purchasing and cost control

- **Needs decision:** Define suppliers, purchase orders, receiving, invoice
  capture, price history, units/conversions, transfers, cycle counts, and the
  accounting boundary.
- **Ready after decision:** Add recipe cost, menu margin, actual-versus-
  theoretical consumption, controllable COGS, waste/variance analysis, and
  explainable reorder suggestions.
- **Needs decision:** Add bar-native counting workflows on top of canonical ml:
  open-container/tenthing entry, category-level pour cost, keg level and
  shrinkage signals, fast cycle counts, and an offline-capable cellar/walk-in
  count flow. Preserve the movement ledger as authority and treat visual
  fractions as input conveniences, not a second unit system.
- **Needs decision:** Define accounting exports, initially evaluating
  QuickBooks and Xero, without turning Crowbar into a general ledger. Keep
  purchase, inventory, waste, and future settlement identifiers reconcilable.
- **Ready after decision:** Merge the existing ML V2 candidates for waste/loss,
  reorder suggestions, richer forecasting, preparation hints, and margin-change
  alerts into this operational workflow rather than building isolated
  dashboards.

### 6. POS and payment integrations

- **Needs decision:** Choose initial POS and payment providers based on target
  customers and geography. Prefer integrating with established POS/payment
  systems before attempting to build terminal hardware, acquiring, payroll, or
  a full general-purpose POS.
- **Ready after decision:** Define authoritative ownership and reconciliation
  for menus, sales, taxes, tips, tenders, refunds, tabs, deposits/card holds,
  offline events, webhook retries, and provider outages.
- **Ready after decision:** Provide a transparent settlement-to-bank breakdown
  and preserve provider portability. Integration credentials, processor choice,
  and a venue's historical operational data must not create avoidable payment-
  processor lock-in.
- **Ready after decision:** Make item availability a single authoritative
  action: an "86" in Crowbar must stop sale across Crowbar menus and every
  connected channel, with per-channel delivery status and reconciliation when
  an integration is unavailable.
- **Needs decision:** Reconcile delivery-marketplace orders, commissions,
  promotions, refunds, and payouts after the core POS contract is proven;
  importing an order without its fees would produce misleading margin data.
- **Ready after decision:** Connect imported sales and settlement data to guest
  history, inventory consumption, margin reporting, and operational insights.

All other product plans remain active below, but their implementation begins
after this sequence unless explicitly pulled forward. Cross-cutting discovery,
especially the initial customer profile, may run earlier when it materially
changes a stage's design.

## Documentation Transition

- **Ready:** Reconcile `README.md` with current manifests and routes. It is a
  useful quick start, but endpoint inventory and some narrative details drift
  as features evolve.
- **Ready:** Reconcile environment examples with every supported mode,
  including frontend mock mode and production CORS configuration.
- **Ready:** Reconcile or retire `docs/backlog.md`. It still lists implemented
  work (staff invitations, phone normalization, SMS reminder deduplication) and
  removed payment columns as if they were current.
- **Ready:** Add nested `AGENTS.md` files only when client, server, or ML work
  develops genuinely different recurring instructions. Avoid duplicating the
  root guide.

## Product and UX

- **Ready:** Audit both planned enhancements and established workflows for
  unnecessary staff friction or speculative state. Prefer the smallest useful
  operational cue over mandatory acknowledgements, repeated confirmation, or
  lifecycle states that do not save a bartender, host, or manager time. Record
  which controls are removed, made optional, or retained with an observed
  service rationale.
- **Needs decision:** Confirm Crowbar's initial ideal customer profile and
  product wedge before later stages diverge: cocktail/bar-led venues,
  full-service restaurants, or small multi-venue groups have materially
  different floor, inventory, labor, and integration priorities. Define the
  operational outcome and time-to-value that makes the first segment adopt.
- **Needs decision:** Design a cross-module shift command center after its
  source workflows are authoritative. Combine today's reservations, queue,
  table state, open tabs, stock risks, no-show risk, demand, and material alerts
  into one prioritized service view rather than copying every dashboard.
- **Ready after source stages:** Add configurable pre-service and handover
  checklists populated by large parties, guest needs, expected covers,
  preparation risks, staffing gaps, and below-par items. Alerts should explain
  the action and deep-link to its owner workflow.
- **Ready:** Optimize onboarding for early value through guided setup,
  opinionated venue templates, safe CSV/import tools, progress recovery, and a
  measurable path to first bookable service or first live menu. Do not require
  a venue to model its entire operation before receiving value.
- **Needs decision:** Add lightweight loyalty and consented retention
  automation only after the CRM contract exists: birthday/regular recognition,
  post-visit thanks, rebook nudges, and simple rewards. Measure incremental
  return visits and opt-outs rather than message volume.
- **Ready:** Connect `ContactDialog` and `FooterContactForm` to a real,
  abuse-protected delivery and support-triage path. Include acknowledgement,
  routing, diagnostic context with consent, status/ownership, and realistic
  response expectations. Both currently log locally and show a false success
  state without sending anything.
- **Needs decision:** Review and approve the landing FAQ and pricing copy before
  treating it as published product messaging.

## Testing and Quality

- **Needs decision:** Define the repository-wide testing strategy and risk-based
  quality gates: which behavior belongs in unit, integration, contract,
  end-to-end, visual, accessibility, performance, security, and migration
  tests.
- **Ready:** Expand frontend tests beyond the current focused Vitest and MSW
  coverage, especially for ordering, reservations, module gates, money/time
  mapping, error states, and HTTP/WebSocket mapper parity.
- **Ready:** Expand PostgreSQL-backed backend integration coverage for every
  module, tenant isolation, roles, public endpoint abuse cases, idempotency,
  legal state transitions, and inventory ledger effects.
- **Needs decision:** Select an end-to-end browser framework and a small set of
  critical user journeys. Evaluate Playwright against the value of
  browser-level coverage before introducing it.
- **Ready:** Add migration-chain tests against a fresh database in addition to
  ORM-metadata tests, including seed validation and a reliable disposable reset
  path.
- **Ready:** Add ML unit, pipeline, minimum-data, reproducibility, and
  leakage-regression tests.
- **Ready:** Establish accessibility checks, responsive/visual regression,
  performance budgets, and failure-mode tests for critical flows.

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

- **Deferred — Railway rollout:** Deployment is intentionally shelved while the
  user observes Railway and product development continues. In project
  `crowbar`, private PostgreSQL, private Redis, and the public FastAPI service
  are online in EU West. API health, database connectivity, migrations 001–022,
  and the Redis stream consumer were verified. Do not resume external changes
  without an explicit user request.
- **Deferred — resume point:** Deploy and enable the local FastAPI rate-limit
  change; then add public Next.js plus private ML, scheduled reminders, and
  durable object storage. Reconcile reference variables, secrets, the web
  domain, CORS, private ML connectivity, and end-to-end smoke tests as each
  service is added.
- **Deferred — production hardening:** Add backup/restore testing, migration
  rollout and rollback procedures, secret management, restricted service
  networking, durable uploads, health checks, monitoring, and release
  automation when the deployment arc resumes.
- **Ready:** Repair or remove the documented `python -m db.migrate reset`
  workflow. Its drop list predates many current tables, so it is destructive
  without being a reliable full reset.
- **Deferred:** Design multi-replica WebSocket fan-out before scaling the API
  beyond one replica. Current connection managers live in one FastAPI process.

## Security and Reliability

- **Ready:** Replace `frame-ancestors *` on embeddable reservation pages with an
  intentional per-business or deployment allowlist.
- **Ready:** Persist tenant-scoped ML result summaries so an ML service restart
  does not empty the Insights dashboard until the next pipeline run.
- **Ready:** Complete abuse controls for the Next.js docs assistant and
  evaluate whether an edge/WAF layer is warranted. FastAPI now has local,
  Redis-backed rolling-window limits for auth, public reservation, queue,
  ordering, and related public reads. Deploying them and verifying Railway
  proxy/IP behavior remain part of the shelved deployment arc.
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
- **Ready:** Harden onboarding redirects across all business routes rather than
  only selected pages.

## Product Architecture

- **Needs decision:** Design privacy-preserving shared learning across tenants.
  Start with anonymous venue-level operational aggregates rather than
  cross-tenant customer profiles. Define the approved feature allowlist,
  purpose and legal basis, anonymization/reidentification tests, minimum cohort
  sizes, differential-privacy needs, retention/deletion handling, model
  lineage, tenant transparency or opt-in, and fairness evaluation before using
  any shared training dataset. Pseudonymized or hashed identifiers alone do
  not make personal data anonymous.
- **Needs decision:** After the operational loop, replace hard-coded
  `kitchen | bar | any` routing tags with configurable stations.
- **Needs decision:** Implement granular permission-based RBAC and a full audit
  system. Current owner/manager/staff roles are coarse, and the order timeline
  is not a platform audit log.
- **Needs decision:** Design active context for dual-role or multi-business
  accounts before changing the one-business tenancy assumption.
- **Deferred:** Multi-location management and location filtering UI. The
  floor-plan stage stays location-ready but does not pull this scope forward.
- **Ready:** Replace the sidebar queue-count poll with shared real-time state
  when the queue socket is lifted into a common provider.
- **Needs decision:** Add real-time tab updates; tab detail is currently
  refresh-driven.
- **Deferred:** Public servings/pours display and stronger ID verification.
  Registered tables move into operational-loop stage 2.
- **Deferred:** Reviews and billing/subscription processing. Stripe packages
  remain installed, but current payment columns and product flows were removed.
  Customer payments belong to operational-loop stage 6; Crowbar subscription
  billing remains a separate product/business decision.

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
- **Needs decision:** Define an offline survival contract for live service:
  which queue, table, order, and inventory views remain readable; which writes
  may queue locally; how staff see stale state; and how conflicts reconcile
  after connectivity returns. Do not promise generic "offline mode" without
  per-operation safety rules.
- **Ready:** Treat mobile-first staff operation as a measurable workflow
  requirement now, independent of whether a native app is chosen later. Audit
  host, bartender, server, inventory-count, and manager tasks for taps, latency,
  one-handed use, interruption recovery, and accessibility during service.

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

- **Needs decision:** Define ML V2 outcomes before adding models. Waste/loss
  analysis, reorder suggestions, and richer operational forecasting move into
  operational-loop stage 5 so they are attached to purchasing and cost-control
  actions rather than isolated predictions.
- **Ready:** Establish reproducible training/evaluation artifacts and tests;
  current latest results are process-memory state backed by durable prediction
  tables.
- **Ready:** Add model/data drift monitoring, minimum-data thresholds, model
  versioning, and scheduled pipeline execution.
- **Ready:** Review whether the ML service should retain write access only to
  its output tables through a restricted database role.
