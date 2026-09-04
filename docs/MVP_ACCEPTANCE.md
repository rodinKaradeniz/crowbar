# MVP Release Inventory and Acceptance Map

This document is the stage-0 release contract for Crowbar's supervised German
pilot. It gives every current application surface an explicit disposition,
traces retained workflows to their authority and evidence, assigns every known
gap to a numbered roadmap stage, and defines the evidence required to close
stages 1–8.

[`TODO.md`](TODO.md) remains the canonical delivery order and scope authority.
[`PRODUCT.md`](PRODUCT.md) owns behavior and vocabulary;
[`ARCHITECTURE.md`](ARCHITECTURE.md) owns the current technical shape. This
document is the execution ledger that connects those authorities to source and
tests. Update it when a retained route, workflow boundary, risk, or release
proof changes.

## Locked release boundary

- Target: one supervised, single-location pilot at a German bar.
- Default operating context: EUR, `de-DE`, `Europe/Berlin`, and
  tenant-country-aware phone handling.
- Tax: tenant-managed, effective-dated operational tax profiles and immutable
  order-line snapshots; Crowbar is not the tax or fiscal authority.
- Settlement: staff records **settled externally** only after the venue's
  separate compliant register completes payment. Crowbar does not take
  payment, manage tenders, or issue receipts or invoices.
- Purchasing: supplier, purchase-order, receiving, discrepancy, invoice or
  delivery reference, and cost reconciliation are in scope. Supplier-invoice
  payment is not.
- Floor: the responsive area-based host board is sufficient. Geometry and
  drag-and-drop are not MVP requirements.

## How to use this map

Disposition terms:

- **Core:** required for the supervised pilot's operational loop.
- **Supporting:** required setup, security, documentation, or administration.
- **Optional:** may be enabled in the pilot, but unavailability cannot corrupt
  or block the core operational record.
- **Redirect:** a deliberate route alias with no independent workflow.
- **Remove/hide:** current code or UI must be removed from reachable MVP
  surfaces until an authoritative workflow is approved.
- **Post-MVP:** deliberately absent from the MVP, even if adjacent data fields
  or old copy exist.

Risk terms:

- **P0:** tenant escape, unauthorized authority, data corruption, or accepting
  a financially meaningful record from untrusted input.
- **P1:** a core journey can fail, lie, lose integrity, or mishandle privacy.
- **P2:** important pilot usability, operability, or breadth that does not make
  the current record unsafe.

A row is closed only when its implementation, negative behavior, automated
tests, and named release evidence all agree. A green page or a happy-path unit
test alone is not acceptance.

## Current route disposition

### Public and identity pages

| Current route | Disposition | Authority key | Access and module | Closing condition |
| --- | --- | --- | --- | --- |
| `/` | Supporting | MKT, BIZ | Public | Product shell retained; simulated contact success, unapproved pricing/social proof, and tenant enumeration were removed. Stage 7 owns final browser/copy review. |
| `/auth` | Redirect | AUTH | Public | Keep as a redirect to staff login. |
| `/auth/login` | Supporting | AUTH | Public | Staff email/password only; customer-dashboard and phone-OTP branches are absent. |
| `/auth/register` | Supporting | AUTH, BIZ | Public | Business-owner registration only, with onboarding handoff. |
| `/auth/forgot-password` | Supporting | AUTH | Public | Generic, rate-limited recovery request backed by an expiring hashed token. |
| `/auth/reset-password` | Supporting | AUTH | Public with single-use token | Expiry, one-time use, shared password policy, and session revocation are enforced. |
| `/invite/[token]` | Supporting | STAFF, AUTH | Public with expiring invite token | Hashed token, validated role, revoke/resend, truthful delivery, expiry, and replay protection are enforced. |
| `/reserve/[business]` | Core | BIZ, RES, SCHED, CRM | Public; reservations enabled and public booking allowed | Stages 1–3 close idempotency, privacy, delivery, Germany formatting, waitlist gating, and full capacity/table behavior. |
| `/reserve/manage/[token]` | Core | RES, SCHED | Public with signed revision-bound token | Stages 1–3 prove expiry, stale revision, late-change, reconfirm, reschedule, cancel, capacity, and DST behavior. |
| `/reserve/waitlist/[token]` | Core | RES, SCHED | Public with signed offer token | Stages 1 and 3 complete offer expiry, concurrency, decline/cancel paths, delivery state, and availability gating. |
| `/queue/[business]` | Core | BIZ, QUEUE, CRM | Public; queue enabled and open | Stages 1–3 add module/open-state enforcement, idempotency, non-fabricated estimates, Germany phone handling, and delivery truth. |
| `/menu/[business]` | Core | BIZ, ORDER, HH | Public; ordering enabled and published menu available | Stages 1, 2, and 4 prove minimal public projection, authoritative availability/pricing/tax, and a useful unavailable state. |
| `/order/[business]` | Core | ORDER, TAB, FLOOR, INV | Public with active table QR/seating context | Stages 1, 2, and 4 prove authoritative cart resolution, scoped idempotency, active seating/tab continuity, tax snapshot, station delivery, and stock effects. |

### Staff pages

All `/business/*` pages require an authenticated staff session and share the
NOTIFY-backed notification shell. `owner/manager` below describes the current
privileged boundary; stage 6 replaces coarse operational access with the
confirmed fixed MVP permission matrix.

| Current route | Disposition | Authority key | Module or role | Closing condition |
| --- | --- | --- | --- | --- |
| `/business` | Redirect | AUTH | Staff | Keep as a redirect to Overview. |
| `/business/onboarding` | Supporting | AUTH, BIZ, SCHED | Owner | Stages 1–2 make the guard consistent and collect authoritative Germany/venue configuration without pretending operating hours are booking availability. |
| `/business/overview` | Core | BIZ, ANALYTICS, RES, QUEUE, TAB, INV, INSIGHT | Enabled modules | Stages 1, 2, and 6 replace UTC/browser-local and false-revenue figures with business-service-day operational metrics. |
| `/business/reservations` | Core | RES, SCHED, FLOOR, CRM | Reservations | Stages 1–3 prove all staff create/edit/no-show/assign actions, conflicts, overrides, failure states, and reconnect behavior. |
| `/business/requests` | Core | RES, SCHED, CRM | Reservations | Retain as pending-request triage; stages 1–3 align onboarding/module gates, timing, and decision feedback. |
| `/business/schedule` | Core | RES, SCHED, FLOOR | Reservations | Retain the three-day ledger; stages 1–3 prove service-day/DST behavior, role-limited overrides, assignments, and capacity conflicts. |
| `/business/floor` | Core | FLOOR, RES, QUEUE, TAB | Any of reservations, queue, ordering | Retain the area board; stages 1–4 prove permissions, assignment-versus-occupancy, seating/tab closure, real-time recovery, and empty configuration. |
| `/business/floor/qr-sheet` | Supporting | FLOOR | Any of reservations, queue, ordering; `floor.configure` | Retain as the printable table QR sheet. A read that never rotates, one card per active table, and the printed origin is the browser's own — a sheet printed off the venue's address is dead paper. |
| `/business/queue` | Core | QUEUE, FLOOR, CRM | Queue | Stages 1–3 add staff walk-ins, open/closed service, reasoned transitions, delivery status, assignment, and seating. |
| `/business/orders` | Core | ORDER, INV | Ordering | Page entitlement is enforced; stage 4 completes station routing, correction/cancellation audit, timing, 86 state, and real-time recovery. |
| `/business/tabs` | Core | TAB, ORDER, FLOOR, CRM | Ordering | Stages 1 and 4 prove tenant-safe shared rounds, external settlement, immutable total snapshot, controlled reopen, and seating closure. |
| `/business/menu` | Core | ORDER, INV, MACT | Ordering | Stages 1, 2, and 4 prove authoritative menu/modifier/recipe ownership, tax assignment, availability, QR output, and station assignment. |
| `/business/inventory` | Core | INV, ORDER | Inventory | Stages 1 and 5 close ledger concurrency/history, recipes and deductions, then receiving, counts, transfers, variance, valuation, and cost control. |
| `/business/customers` | Core | CRM, RES, QUEUE, TAB, ORDER | Staff; sensitive actions owner/manager | Stages 1 and 6 close privacy/identity integrity, canonical timeline links, role-limited mutations, consent suppression, retention, and export. |
| `/business/customers/[customerId]` | Core | CRM | Staff; merge/export/anonymise owner/manager | Stages 1 and 6 prove tenant scope, conservative merge, usable notes/tags/preferences, privacy actions, and not-found/error states. |
| `/business/insights` | Optional | INSIGHT, ANALYTICS | Insights | Stage 6 makes persisted, tenant-safe ML outputs reproducible and clearly optional; stage 8 proves ML outage never blocks the core loop. |
| `/business/staff` | Supporting | STAFF, AUTH | Owner/manager for management; role-limited view | Stages 1 and 6 close tenant escape, escalation, disable/revocation, invitations, last-owner protection, and the fixed permission matrix. |
| `/business/docs/[[...slug]]` | Supporting | DOCS | Staff | Retain static product docs. Hide the assistant when unconfigured; stages 1 and 7 add safe limits/failure behavior if it remains enabled. |
| `/business/profile` | Redirect | BIZ | Staff | Keep as a redirect to Business Info. |
| `/business/profile/info` | Supporting | BIZ | Owner/manager mutations | Stages 1–2 align authorization and Germany business/contact formatting. |
| `/business/profile/hours` | Supporting | BIZ | Owner/manager mutations | Keep as public operating information; stages 1–2 preserve its separation from booking schedules and use venue timezone. |
| `/business/profile/booking` | Supporting | SCHED, RES | Reservations; owner/manager mutations | Stages 1–3 prove policy persistence, public-booking toggle, reminders, late changes, and resource rules. |
| `/business/profile/types` | Supporting | SCHED | Reservations; owner/manager mutations | Positive concurrency default and party/duration/resource policy are validated. |
| `/business/settings` | Redirect | AUTH | Staff | Keep as a redirect to Profile Settings. |
| `/business/settings/profile` | Supporting | AUTH | Current user | Stages 1–2 prove profile mutation, validation, locale/phone formatting, and session behavior. |
| `/business/settings/account` | Supporting | AUTH | Current user | Password policy, recovery, session revocation, and effective account disablement are enforced. |
| `/business/settings/modules` | Supporting | BIZ | Owner | Navigation, pages, HTTP, and WebSockets share the entitlement boundary; stage 6 expands the role matrix. |
| `/business/settings/widget` | Supporting | BIZ, RES | Reservations; owner/manager | Embedding defaults to self and uses exact configured origins; stage 3 proves complete public/module-disabled behavior. |

### Next.js route handlers

| Current handler | Disposition | Responsibility and acceptance |
| --- | --- | --- |
| `/api/auth/login`, `/api/auth/logout`, `/api/auth/session` | Supporting | Retain the httpOnly-cookie BFF session boundary; stage 1 proves disabled/revoked sessions, safe redirects, and consistent error shapes. |
| `/api/auth/register` | Supporting after reduction | Retain only business-owner registration; remove its customer branch in stage 1. |
| `/api/invite/accept` | Supporting | Retain cookie handoff after stage-1 invitation/token/password hardening. |
| `/api/proxy/[...path]` | Supporting infrastructure | Retain authenticated forwarding; stage 1 regression-tests authentication, error/status/header behavior, and mutation boundaries. |
| `/api/ws-token` | Supporting infrastructure | Retain short-lived business-bound WebSocket credentials; stages 1 and 7 prove revocation, tenant scope, reconnect, and HTTP/WS parity. |
| `/api/health` | Supporting infrastructure | Retain for local and later Railway health checks; stage 8 defines local release evidence and stage 9 adds deployment readiness. |

No customer dashboard, customer account area, payment screen, receipt/invoice
route, cash drawer, fiscal export, or supplier-payment route belongs in this
MVP. References to those surfaces are removal defects, not missing MVP pages.

## Authority registry

The route tables refer to these keys. “Evidence” states what exists now, not
what is sufficient for release.

| Key | API contract and code owner | Persistence authority | Events or external effects | Current evidence and release owner |
| --- | --- | --- | --- | --- |
| MKT | Server-rendered landing page and approved public business projection | `businesses` only when explicitly public | None | No dedicated tests; stage 1 removes false/dead states, stage 7 owns the redesigned copy, and stage 8 visually/smoke-tests it. |
| AUTH | `/api/auth/*`; `auth_service`, `staff_service`; Next auth handlers and cookie helpers | `users`, `staff`, future revocation/recovery records | Session cookie; email for recovery/invite through provider boundary | Backend auth unit/integration and frontend auth/login tests exist; stage 1 owns missing security and recovery coverage. |
| BIZ | `/api/businesses/*`; `business_service`, `location_service` | `businesses`, `locations` | No domain event | Auth/tenant tests cover parts; stages 1–2 own public projection, guards, tenant configuration, and Germany fields. |
| SCHED | `/api/service-types/*`, `/api/booking-schedules/*`, `/api/availability` | `service_types`, `booking_schedules`, reservations and table resources consulted by availability | No event for configuration | Strong booking schedule/availability backend tests plus availability frontend units; stages 1–3 close default drift, permissions, DST, and end-to-end use. |
| RES | `/api/reservations/*`; `reservation_service`, guest-token, waitlist, availability, and notification services | `reservations`, `reservation_waitlist_entries`, assignments, schedules, customers | `reservation.created`, `cancelled`, `reconfirmed`, `rescheduled`, `updated`, `no_show`, `deleted`; email/SMS | Broad backend route/service/reschedule tests and reservation-form/dialog tests exist; stages 1 and 3 own retry, delivery, token, concurrency, and full-journey evidence. |
| QUEUE | `/api/queue/*`, `/ws/queue/*`; `queue_service`, notification service, queue WS manager | `queue_entries`, customers, notifications, queue table assignments | `queue.party_joined`, `called`, `removed`; SMS and WS | No dedicated queue tests; stages 1 and 3 own all contract, transition, delivery, capacity, and browser evidence. |
| FLOOR | `/api/floor-plan/*`, `/ws/floor-plan/*`; `floor_plan_service`, QR service, WS manager | areas, tables, combinations, assignments, seatings, tab association | `floor_plan.*` through Redis/WS | Backend floor routes and one seating-sheet integration test exist; stages 1, 3, and 4 own authorization, concurrency, reconnect, and complete seating/tab proof. |
| ORDER | `/api/ordering/*`, `/ws/orders/*`; `menu_service`, `order_service`, `recipe_service`, QR and order WS services | menus, categories, items, modifier groups/modifiers, item library, orders/lines/status history, recipes and movement references | `order.placed`, `order.status_changed`, `floor_plan.tab_updated`; WS and inventory effects | No dedicated order/menu tests; stages 1, 2, and 4 own server authority, tax, station, correction, availability, concurrency, and browser proof. |
| TAB | `/api/tabs/*`; `tab_service` plus order and floor services | tabs, tab orders, orders/lines, seating/customer links | `floor_plan.tab_opened`, `tab_updated`, `tab_closed`, `order.placed` | No dedicated tab tests; stages 1 and 4 own tenant safety, shared rounds, external settlement, audit, reopen, and seating close. |
| MACT | `/api/ordering/{business_id}/menus/{menu_id}/activation-windows`; `menu_activation_service` used by both the public menu read and authoritative order placement | `menu_activation_windows` | No configuration event | `tests/integration/test_menu_activation.py` owns the midnight wrap, venue-timezone reading, and the rejection of an order from a menu outside its window. |
| INV | `/api/inventory/*` and ordering recipe endpoints; `inventory_service`, `recipe_service` | inventory items, stock movements, recipes, order-linked movement references, locations | `inventory.movement_recorded`; low-stock notifications | No dedicated inventory tests; stages 1, 4, and 5 own ledger integrity, deductions/reversals, receiving/counting, valuation, and browser proof. |
| CRM | `/api/customers/*`; `customer_identity_service`, `customer_service` | customers, notes, tags, consent provenance, data requests, merge audit plus source workflow records | No domain event; retention job mutates privacy data | Backend CRM/identity/reservation-customer tests exist; stages 1 and 6 own schema alignment, consent, activity, canonical links, intake, retention, and role proof. |
| STAFF | `/api/staff/*`; `staff_service`, invite email service | staff assignments, users, staff invitations | Invitation email | No dedicated staff route suite; stages 1 and 6 own tenant/role/session/invitation and permission-matrix evidence. |
| NOTIFY | `/api/notifications/*`; `notification_service` plus reservation/queue delivery services and scheduled jobs | notifications and workflow-specific delivery/deduplication fields; stage 1 adds durable channel attempts | Email/SMS and staff notification UI | Notification integration and email/reminder units cover parts; stages 1 and 3 own channel truth, retry/fallback, tenant/user scope and shell behavior. |
| ANALYTICS | `/api/analytics/*`; `analytics_service` | Read models computed from reservations, queue, orders, tabs, inventory | None | No dedicated analytics suite; stages 1, 2, and 6 own semantic, service-day, cancellation, and report reconciliation tests. |
| INSIGHT | `/api/insights/*`; FastAPI gateway and private ML service | Main operational tables plus ML result tables; latest response also held in process memory | Private HTTP pipeline run | FastAPI router units and two ML tests exist; stages 1 and 6 own reproducibility/persistence, stage 8 owns outage tolerance. |
| DOCS | Static MDX loader | Checked-in documentation chunks; no product record | None | Build exercises docs compilation. The optional OpenAI docs assistant and its route were removed in stage 7; there is no third-party provider on this surface. |

Redis events are failure-tolerant projections, not the authoritative record.
Acceptance for every event-backed workflow therefore requires both committed
database state and reconnect/reconciliation behavior when publish or WebSocket
delivery fails.

## Initial risk and mismatch register

All entries were found by the stage-0 repository audit. A later discovery is
added here before implementation so there remains one release ledger.

| ID | Risk | Known mismatch or missing behavior | Stage assignment | Required closing proof |
| --- | --- | --- | --- | --- |
| BASE-01 | P1 | Frontend lint currently reports errors and material warnings even though the test suite and production build complete. | 1A | Zero lint errors; every warning fixed or explicitly justified; focused tests and build pass. |
| BASE-02 | P1 | `ServiceTypeCreate.max_concurrent_bookings` defaults to `None` while product/schema tests require a positive default of one. | 1A | Migration, ORM, create/update/response schema and regression test agree. |
| BASE-03 | P1 | ML has only sparse tests and no reproducible local test environment in the audited checkout. | 1A, 6 | Reproducible install/import/test command first; later data, model, persistence and scheduling acceptance. |
| BASE-04 | P2 | The seed exercises reservations/orders/inventory but has no tables, tabs, or future waitlist scenario. | 1A, 8 | Stage 1 proves schema/relationship validity; stage 8 supplies the full deterministic pilot scenario. **Stage 8 part one seeded the floor plan, seatings, tabs, external settlement, live queue and waitlist, and the eleven-step loop was walked on it; the remaining evidence is the automated browser journey (part two).** Not closed here — closing a risk needs more than an edit to this file. |
| AUTH-01 | P1 | Login/register still expose customer accounts, phone OTP, and redirects to nonexistent `/customer/*` pages although guests are account-free. | 1B, 1E | Branches/routes/search entries removed; staff auth and public guest journeys regression-tested. |
| AUTH-02 | P1 | Forgot/reset password pages have no authoritative backend workflow. | 1B | Generic rate-limited request, hashed single-use expiring token, policy enforcement, revocation, and tests. |
| AUTH-03 | P0 | Account disablement only prefixes `user_type`; authentication does not reject it and existing JWTs remain usable. Staff removal/password changes also lack session revocation. | 1B | Disabled/removed users fail new and existing sessions across HTTP and WS; revocation tests cover every trigger. |
| AUTH-04 | P1 | Backend registration/invitation/password change do not share an enforced password policy. | 1B | One server policy at every password entry point with negative tests and non-leaking errors. |
| TENANT-01 | P0 | `POST /api/staff` accepts request `business_id`/`user_id`; `current_business` is loaded but not used to bind the write. | 1B | Tenant is dependency-derived, foreign associations rejected, PostgreSQL route/service isolation tests pass. |
| TENANT-02 | P1 | Generic `POST /api/businesses` authenticates a user but does not use that identity to authorize or associate the created tenant, duplicating the owner-registration path. | 1B, 1E | Remove the unused path or make one authoritative owner-creation transaction; prove no orphan/cross-tenant business can be created. |
| ROLE-01 | P0 | Closed 2026-08-26. The fixed five-role capability matrix guards every authenticated route, escalation paths are refused, a demotion revokes existing sessions, and the frontend mirror is parity-tested against the server. | 1B, 6 | Closed — see Stage 6 closure evidence. |
| INVITE-01 | P1 | Invitation tokens are stored raw; pending/revoke/resend/duplicate handling is absent and email failure is ignored while success is claimed. | 1B | Hashed token lifecycle, truthful delivery state, role/expiry/replay tests, and usable management UI. |
| PUBLIC-01 | P1 | Public business list/detail return the staff-oriented `BusinessResponse`, exposing modules, onboarding and notification/ordering configuration; the landing page enumerates tenants. | 1B, 1E | Minimal intentional public projection, approved discoverability, enumeration/rate-limit tests, and no staff-only fields. |
| EMBED-01 | P1 | Reservation embedding allows unrestricted framing through `frame-ancestors *`. | 1B, 1E | Intentional deployment/business allowlist, denial tests, and documented widget configuration. |
| GUARD-01 | P1 | Closed 2026-08-26. Every staff page carries an onboarding, module and capability gate; navigation is gated on the server's own capability list; `docs/permission-matrix.md` records every route's guard and a test fails when one has none. | 1E, 6 | Closed — see Stage 6 closure evidence. |
| ORDER-01 | P0 | Order placement trusts submitted modifier IDs, names, and price deltas, including negative deltas. | 1C | Server resolves tenant/item/group modifier authority, rejects invalid combinations, and prices concurrent retries identically. |
| ORDER-02 | P0 | Unknown items are silently skipped, allowing an empty zero-value order; item/menu/category availability, membership and modifier constraints are incomplete. | 1C | Whole-cart rejection with precise errors and no persisted order/stock/event side effect. |
| ORDER-03 | P0 | Order idempotency and order-status lookup are not business-scoped, enabling cross-tenant collision or disclosure. | 1C | Composite scope, same-key/same-body replay, same-key/different-body conflict, tenant isolation and concurrency tests. |
| ORDER-04 | P1 | Preparation stations are hard-coded and order correction/cancellation/audit and useful all-day timing are incomplete. | 4 | Tenant-configured routing, legal transitions, actor/reason/timestamps, real-time recovery and station browser tests. |
| ORDER-05 | P1 | Item 86/availability can diverge between public menu, staff composition, inventory automation, and live ticket state. | 1C, 4 | One authoritative state, projection/reconciliation behavior, and public/staff parity tests. |
| MONEY-01 | P1 | UI and reports mix `$`/`€`, browser locale/time, and hard-coded assumptions; no tenant country/currency/locale boundary or order tax snapshot exists. | 1E, 2 | Shared boundary cleanup first; then Germany config, effective tax profiles, inclusive rounding, mixed-order and DST tests. |
| SETTLE-01 | P1 | Tabs use simulated closure/`settled_method` semantics rather than an audited `settled_externally` record and immutable total snapshot. | 4 | Confirmed state/schema vocabulary, actor/time/reference/note snapshot, controlled reopen, no tender semantics, tests. |
| ANALYTICS-01 | P1 | Overview labels all non-cancelled order totals as revenue; ordering KPIs include misleading cancellation/hour behavior and “today” is UTC rather than venue service day. | 1C, 1D, 2, 6 | Ordered/open/externally-settled meanings reconcile to source records in tenant timezone; report tests cover cancellation and rollover. |
| QR-01 | P1 | Legacy free-text/stale table QR URL paths can still be surfaced beside registered-table revision credentials. | 1E, 4 | Only signed registered-table QR is generated; rotation, stale revision, active seating and tenant tests pass. |
| INV-01 | P0 | Inventory movement uses an unlocked read-modify-write balance, so concurrent writes can diverge from the movement ledger. | 1D | Row lock or atomic update, concurrency test, reconciliation command/check, and incident-visible mismatch. |
| INV-02 | P1 | Inventory updates allow invalid negative par/cost values, have broken absent-versus-null clearing, and do not consistently validate related location ownership. | 1D | Schema/DB constraints, patch semantics and foreign-tenant relation tests. |
| INV-03 | P1 | Deleting an inventory item cascades away movement history. | 1D | Archive/deactivate instead; historical ledger remains queryable and immutable in tests. |
| INV-04 | P1 | Recipe writes silently skip missing, foreign, duplicate or invalid ingredients. | 1D | Atomic whole-recipe rejection and tenant/duplicate/unit tests. |
| INV-05 | P1 | Automatic served deductions swallow failures without a durable discrepancy/reconciliation record. | 1D, 4 | Fulfillment remains non-blocking but records and surfaces every discrepancy; correction/reversal tests use order-linked movements. |
| INV-06 | P2 | Low-stock alerts repeat on every below-par movement rather than threshold crossings. | 1D | Crossing/re-arm rule with deduplication tests. |
| CRM-01 | P1 | Migration 029 allows anonymised reservation contact to be null while ORM/schema contracts still require values. | 1D | Migration, ORM, Pydantic, frontend mapper and anonymisation tests align. |
| CRM-02 | P1 | Later unchecked consent cannot reliably withdraw existing consent; suppression and conservative merge behavior are incomplete. | 1D, 6 | Provenance-preserving withdrawal/suppression and no-consent-expansion merge tests plus usable privacy UI. |
| CRM-03 | P1 | Retention inactivity relies on `customer.updated_at`, which is not authoritative guest activity. | 1D, 6 | Activity derived from canonical workflows; deterministic retention job tests and pilot scheduling. |
| CRM-04 | P1 | Order/tab customer linkage can omit orders from the canonical guest timeline. | 1D, 4, 6 | Seating/tab/order identity propagation, merge-safe history and cross-workflow timeline tests. |
| RES-01 | P1 | Public reservation creation has no idempotency contract. | 1D | Scoped key/request fingerprint, retry/concurrency tests, and no duplicate notification/event. |
| RES-02 | P1 | Reminder formatting uses UTC; notification attempts are not durable per channel, retries are weak, and user content in HTML email is not escaped. | 1D, 3 | Business timezone/service-day rendering, escaped templates, attempt state, retry/fallback and truthful status tests. |
| WAIT-01 | P1 | Public future-waitlist join is not gated by actual unavailability; decline/cancel/remove/history/fallback-channel flows are incomplete and expiry is partly opportunistic. | 1D, 3 | Availability gate, complete transitions, deterministic expiry, delivery state, concurrency and UI tests. |
| QUEUE-01 | P1 | Queue has no explicit service open/closed/schedule/capacity policy and public join does not enforce module/open state. | 1D, 3 | Tenant schedule/open gate at server, useful closed state, capacity/concurrency tests. |
| QUEUE-02 | P1 | Queue idempotency is unused, duplicate joins are allowed, and `position × 5` presents a fabricated estimate. | 1D, 3 | Retry/dedup contract and measured/configured estimate or no estimate, with tests. |
| QUEUE-03 | P1 | Queue defaults to US phone handling; synchronous SMS can fail after status changes while UI claims the party was notified; staff walk-in creation/reasoned removal is absent. | 1D, 2, 3 | Country-aware input, durable attempt/truthful state, retry/fallback, staff creation and reason transitions. |
| REALTIME-01 | P1 | Redis publication is best-effort and in-process WS state can be missed; retained pages lack a uniform stale/reconnect/reconciliation contract. | 1D, 3, 4, 7 | Commit-first state, explicit disconnected/stale UI, snapshot refresh after reconnect, and Redis/WS failure tests. |
| ML-01 | P2 | Latest ML results are process-memory dependent, pipelines are unscheduled, data-readiness rules are thin, and legacy payment wording remains. | 6, 7 | Persisted/versioned results, minimum-data/reproducibility/leakage/drift rules, optional scheduling, correct settlement vocabulary and outage proof. |
| BUY-01 | P1 | Closed 2026-08-25. Supplier, purchase-order, partial receiving, stock-count, price-history, valuation and cost-control workflows ship on one auditable ledger; location transfers are deferred with a trigger. | 5 | Closed — see Stage 5 closure evidence. |
| REPORT-01 | P2 | Authoritative queue, floor, tab, purchasing, margin, variance, staff-action and ticket-timing reports/exports are incomplete. | 6 | Source-reconciled report tests, role checks, service-day semantics and useful non-fiscal export evidence. |
| OPS-01 | P1 | There is no repository CI or critical browser E2E suite; storage is local and outage/load/accessibility/responsive coverage is incomplete. | 8, 9 | Local CI-equivalent gate and failure matrix first; durable object storage and deployment operations in stage 9. |
| OPS-02 | P1 | Railway is partially provisioned at migrations 001–022 while local code is at 030; web/ML/jobs, backups, restore, monitoring and rollback are incomplete. | 8 | Do not mutate before explicit authorization; reconcile and prove the full deployment runbook after local acceptance. |
| OFFLINE-01 | P2 | Full offline service/count operation is absent. | 5, 7, post-MVP | MVP proves graceful failure and safe retry; full offline counts/service remain deferred unless pilot evidence changes scope. |
| COPY-01 | P1 | Contact forms simulate success; landing social proof, pricing and draft FAQ include unapproved or stale claims, including payment-like tab language. | 1E | Remove/hide or connect an approved authoritative workflow; copy review and browser smoke prove no false success/claim. |

## Risk-ranked acceptance matrix for stages 1–8

This is the implementation checklist. Rows are ordered by dependency and risk,
not by UI convenience.

| Stage / risk | Accepted journey or capability | Non-negotiable invariants | Required failure behavior | Minimum automated level | Release evidence |
| --- | --- | --- | --- | --- | --- |
| 1 / P0 | Staff identity, invitation, role change, disable/removal, and session use | Tenant comes from auth; validated hierarchy; no manager-to-owner path; last owner survives; every sensitive change revokes affected sessions | Generic auth/recovery responses; denied action changes nothing; failed invite delivery is visible, retryable, and never called sent | PostgreSQL route/service isolation and concurrency tests; frontend role/guard tests; HTTP/WS revocation tests | Fresh owner registration through onboarding, invite/accept, denied escalation, disable and immediate HTTP/WS denial demonstrated locally |
| 1 / P0 | Public and staff order placement | Server owns menu/item/modifier/price/menu-window/business/table/seating/tab resolution; empty or mixed-invalid cart is atomic; idempotency is business/request scoped | Invalid or stale input produces a stable 4xx and no order, event, tab total, or stock movement | PostgreSQL contract, tenant, retry and concurrency tests; frontend cart/error tests | Same QR retry produces one correctly priced round; tampered price/modifier and foreign IDs are rejected |
| 1 / P0 | Inventory movement and recipe integrity | Movement ledger and balance never diverge; history is not deleted; all related IDs are tenant-owned; recipe replacement is atomic | Deduction failure records a visible discrepancy without fabricating balance or losing served status | PostgreSQL locking/concurrency, constraint, archive, recipe and reconciliation tests | Concurrent movement check reconciles; archived item history and a forced deduction discrepancy are inspectable |
| 1 / P1 | Reservation, waitlist, CRM and notification integrity | Public writes are retry-safe; tokens bind revision; nullable anonymised contacts align; consent never expands implicitly; venue timezone governs service | Stale/expired/conflicting mutations change nothing; delivery failure is recorded and retried; HTML is escaped | PostgreSQL token/retry/concurrency/privacy/DST tests plus notification job units and frontend error tests | Duplicate booking retry yields one reservation; privacy withdrawal persists; reminder and service-day examples render in venue time |
| 1 / P1 | Retained route and quality baseline | Every route has auth/onboarding/module/role rules and honest empty/error/loading states; no dead customer/payment/contact path | Denial is a useful 401/403/module state; optional dependency failure cannot show success | Frontend lint/test/build, full backend suite, ML import/tests, fresh migration/seed, route-matrix tests | Zero failing repository checks and no known P0/P1 remains open in this register |
| 2 / P1 | Configure a German pilot tenant | Country, EUR, locale, timezone, address and phone defaults come from tenant config and are auditable | Invalid IANA zone/currency/phone/config is rejected without partial update | Schema/DB and formatter/parser tests; frontend settings tests | New tenant uses `de-DE`, EUR and `Europe/Berlin` consistently across representative public/staff pages |
| 2 / P1 | Configure and apply operational tax profiles | Effective-dated tenant profile; owner/manager authority; item assignment; immutable line snapshot; deterministic inclusive rounding; non-fiscal label | Missing/inactive/wrong-tenant profile blocks placement; rate changes never rewrite history | PostgreSQL temporal/tenant/rounding/mixed-order tests and frontend settings/order tests | Two orders across a rate change preserve different snapshots and reconcile to displayed totals |
| 3 / P1 | Reservation to table | Book/manage/reconfirm/reschedule/no-show, plan table, arrive and seat exactly once under capacity/resource/turn-buffer/service-day rules | Conflict, stale token, lost delivery or reconnect never double-allocates or hides authoritative state | PostgreSQL concurrency/DST/module tests; frontend workflow and WS reconnect tests | Full public-to-host journey on desktop and target mobile viewport from fresh demo state |
| 3 / P1 | Future waitlist to reservation | Join only when unavailable; one live expiring offer; accept atomically into authoritative reservation; decline/cancel/remove/history complete | Expired/stale/concurrent loser remains unbooked with honest status and no duplicate message | PostgreSQL transition/concurrency/expiry tests plus public/staff frontend tests | Staff issues offer, guest accepts once, competing acceptance loses safely, history is visible |
| 3 / P1 | Walk-in queue to table | Queue open/capacity policy, retry-safe join/staff walk-in, measured/configured estimate, delivery state, reasoned transitions and table assignment | Closed/full/duplicate states are explicit; failed SMS does not claim notification; estimate may be omitted | PostgreSQL transitions/idempotency/module tests; frontend public/staff/WS tests | Public and staff walk-ins can be called, assigned, seated and recovered after reconnect |
| 4 / P1 | Shared staff/QR ordering and stations | One seating has one open tab; authoritative 86 and tax/price snapshot; tenant-configured station; audited status/edit/cancel timing | Stale station/availability/reconnect state refreshes; illegal correction has no stock or tab side effect | PostgreSQL lifecycle/concurrency tests; order/menu/tab/WS frontend tests | QR and staff rounds appear on same tab and correct stations; corrections reconcile movements and totals |
| 4 / P1 | External settlement and seating closure | `settled_externally` is an audited assertion with immutable total, actor/time and optional informational reference/method; no tender ledger | Open/unsettled tab blocks seating close; reopen is manager-only with reason; repeated settlement is safe | PostgreSQL transition/role/audit tests and floor/tab frontend tests | Venue-register completion is recorded, report classification changes, seating closes; no payment/receipt UI exists |
| 5 / P1 | Supplier order through receiving | Supplier product/pack conversion, PO approval/status, partial receive/substitution/discrepancy and reference capture feed the same movement ledger and price history | Duplicate receive is retry-safe; over/foreign/wrong-unit receipt is rejected; discrepancy remains visible | PostgreSQL lifecycle/idempotency/unit/tenant tests and purchasing frontend tests | PO partially received twice, reconciled and closed with exact stock and cost history; no invoice-payment action exists |
| 5 / P1 | Count and explain stock | Stocktake/cycle count, bottle tenthing/keg level, waste/shrinkage reasons and adjustment all reconcile to ledger | Interrupted/import-invalid count is resumable or rejected atomically; a reconcile re-reads the book under lock so a stale seeded figure is never used | PostgreSQL count/conversion/CSV tests and responsive count/import frontend tests | Physical count reconciles; CSV round-trip and variance explanation are reproducible. Transfers are deferred, not delivered — see `TODO.md`. |
| 5 / P2 | Cost and reorder decisions | Valuation, recipe cost, gross margin, pour cost, theoretical/actual use, waste and reorder suggestion share canonical units/cost history and show inputs | Missing cost/forecast/lead time yields an explicit incomplete estimate, never invented precision | Service calculation tests plus report/UI reconciliation tests | Representative menu item traces from PO price and recipe through served movement, variance and margin |
| 6 / P1 | Fixed pilot permission matrix | Owner, manager, host/server, bar/kitchen and inventory operator see only required data/actions; server remains authority | Hidden and direct-call unauthorized actions return denial with no mutation | Exhaustive role × endpoint/page matrix tests | Each seeded role completes its tasks and fails a representative forbidden task |
| 6 / P1 | Guest privacy and canonical timeline | Reservation, queue, tab and order history link to one business-scoped guest; intake, correction, withdrawal, suppression, merge, export and retention preserve audit/anonymous operations | Ambiguous merge or identity conflict requires review; privacy job failure is alertable and retry-safe | PostgreSQL identity/merge/retention/role tests plus CRM frontend workflows | Pilot privacy request and conservative merge complete locally; operational history remains reconciled |
| 6 / P2 | Operational reporting | Covers/no-show, waits/seating, utilization/turn, items/stations, open/settled tabs, inventory/purchasing/cost/waste and staff timing reconcile to source/service day | Missing optional data is labelled; no number is called revenue, fiscal, accounting or bank settlement without authority | Source-reconciliation and timezone tests plus export/UI tests | Manager can trace selected report figures back to source records and export useful non-fiscal output |
| 6 / P2 | Optional ML insights | Tenant-safe inputs/results, minimum-data rules, version/reproducibility/leakage/drift metadata and persisted latest outputs | Unavailable/insufficient/stale model is explicit and never blocks core pages | ML unit/integration plus FastAPI gateway tenant/failure tests | Core demo passes with ML down; when enabled, a result survives process restart and states its limits |
| 7 / P1 | Fresh local pilot demonstration | Deterministic seed covers all retained core roles/states; critical journey runs from booking through settlement, stock, guest and cost history | Any failed step leaves a diagnosable, recoverable state; reset never uses production-destructive tooling | Automated browser E2E plus fresh migration/seed and all repository checks in CI | One command prepares a fresh demo; critical journey passes on supported desktop/mobile browsers |
| 7 / P1 | Failure, accessibility and local release gate | Email/SMS/Redis/WS/ML loss cannot corrupt core state; key workflows are keyboard/label/focus/contrast/responsive usable; secrets/dependencies checked | Optional outage degrades honestly with retry/reconcile; no false success or silent loss | Deterministic failure injection, accessibility, responsive, load/concurrency and security scans | Signed local checklist shows no visible placeholder/dead control, no open P0/P1 and all required evidence linked |

## Baseline evidence captured at stage 0

The audit established the starting point; these are not release claims:

- Frontend production build completed, and the current Vitest suite completed,
  but lint reported eight errors and fifteen warnings. The frontend suite covers
  auth, availability, reservation forms and one floor seating interaction; it
  does not yet cover most core operational modules.
- The PostgreSQL backend suite completed with 130 passing and one failing test;
  the failure is the service-type concurrency default in `BASE-02`. The run
  also emitted a substantial deprecation-warning backlog.
- All migrations 001–030 and the current seed completed on a disposable fresh
  database. The seed lacks the table/tab/future-waitlist scenario required by
  stages 1 and 7.

## Stage 1 closure evidence — 2026-08-14

Stage 1 is complete locally. This evidence supersedes the Stage 0 defect
wording for the Stage 1 portions of the risk register; rows shared with later
stages remain open only for the explicitly later-stage breadth.

- `BASE-01` through `BASE-04`: frontend lint and TypeScript are clean, all 41
  frontend tests and the production build pass, the ML suite is reproducible
  in `ml/Dockerfile.test` and passes all six tests, and
  `scripts/verify-fresh-db.sh` applies migrations 001–036, seeds twice, asserts
  canonical relationships, and cleans its disposable database.
- `AUTH-01` through `AUTH-04`, `TENANT-01`, `TENANT-02`, `ROLE-01`, and
  `INVITE-01`: public account/OTP branches are gone; owner registration and
  invitation acceptance are the only staff-entry paths; password recovery,
  token hashing/expiry/single-use behavior, session-version revocation,
  disabled/removed account denial, tenant derivation, role hierarchy,
  self/last-owner protection, invitation delivery truth, and HTTP/WebSocket
  session checks have PostgreSQL regressions.
- `PUBLIC-01`, `EMBED-01`, `GUARD-01`, `QR-01`, and `COPY-01`: public business
  projections are minimal; reservation framing defaults to self and accepts
  only configured exact HTTP(S) origins; retained dashboard pages share
  onboarding/module/role guards; only signed registered-table QR entry remains;
  and fake contact success, placeholder reviews, unapproved pricing, payment
  packages, and dead customer routes are removed.
- `ORDER-01` through the Stage 1 portion of `ORDER-05`, plus the Stage 1 portion
  of `ANALYTICS-01`: menu/item/modifier/price authority is server-owned, invalid
  carts are atomic, idempotency is tenant/request scoped, simultaneous public
  QR and staff-tab retries create one order, and uncollected totals are labelled
  ordered value rather than revenue. Stage 4 still owns station configuration,
  lifecycle correction/cancellation, and authoritative 86 breadth.
- `INV-01` through `INV-06`: movement rows and balances remain locked and
  reconcilable under concurrency; items archive without losing history;
  constraints and tenant locations are enforced; recipes reject invalid input
  atomically; automatic deduction failures persist as visible discrepancies;
  and low-stock messages fire on threshold crossings.
- `CRM-01` through the Stage 1 portions of `CRM-04`, `RES-01`, `RES-02`,
  `WAIT-01`, `QUEUE-01` through `QUEUE-03`, and `REALTIME-01`: nullable
  anonymised contacts align end to end; consent withdrawal/suppression and
  conservative merge behavior are tested; retention uses authoritative
  activity; tab orders attach to canonical guests; public reservations are
  concurrently idempotent; reminder channel attempts persist and retry in
  venue time with escaped content; public queue/module and guest-token module
  gates are enforced; the fabricated queue estimate is removed; and event
  publication follows commit on the repaired creation paths. Stages 2–4 retain
  the country parser, complete queue/waitlist lifecycle, notification fallback,
  and uniform reconnect breadth named in those rows.
- Money and business-time formatting now cross shared frontend boundaries; no
  retained code uses US-default phone parsing, browser dialogs, hard-coded
  dollar/Euro display glyphs, or browser-local venue timestamps on the audited
  operational paths. Stage 2 subsequently replaced the temporary EUR/`de-DE`
  boundary with persisted tenant configuration and tax snapshots.

Final verification: 150 backend tests passed against PostgreSQL; 41 frontend
tests passed; frontend lint, TypeScript, and Next.js production build passed;
six ML tests passed in the reproducible container; the disposable migration and
repeat-seed verifier passed; and `git diff --check` passed. The 160 backend
warnings all originate in `python-jose`'s deprecated `datetime.utcnow()` use;
Node/Vitest and Next.js also report runtime/convention deprecations. These are
recorded as maintenance debt in `TODO.md` and do not conceal a failed check.

## Stage 2 closure evidence — 2026-08-14

Stage 2 is complete locally and closes `MONEY-01` plus the Stage 2 portions of
`BIZ`, `ORDER`, `HH`, `ANALYTICS-01`, `QUEUE-03`, and both Stage 2 acceptance
rows.

- Migration 037 adds tenant country/currency/formatting locale/tax label,
  regional audit, stable tax profiles, append-only effective versions, explicit
  menu/library assignment, wider currency-neutral amount storage, and immutable
  order/line currency-tax snapshots. Upgrade-in-place and full 001–037 fresh
  migration both pass; the canonical German demo seed passes twice.
- Registration, onboarding, and Settings → Region & operational tax use
  validated CLDR-backed choices and explicit editable suggestions. Currency
  locks after monetary activity; country-aware phone normalization, configured
  money/date/time formatting, and non-fiscal tax disclosure flow through public
  and staff surfaces.
- Owners/managers exclusively manage profiles and new priced-item assignment.
  Runtime code never infers food/beverage treatment. Profile changes append,
  assigned profiles cannot be archived, foreign profiles are rejected, and old
  order lines remain unchanged across later versions.
- `test_regional_tax`, `test_regional_tax_routes`, and
  `test_order_authority` cover ISO/locale/timezone/phone validation, EUR/JPY/KWD
  precision, half-up inclusive/exclusive rounding, mixed profiles, temporal
  versions, immutable snapshots, permissions, and tenant isolation. Frontend
  money/business-time tests cover configured currencies/locales and Berlin DST.

Final Stage 2 verification: 161 PostgreSQL backend tests and 43 frontend tests
passed; frontend lint, TypeScript, and Next.js production build passed; the
existing database applied migration 037; the disposable full migration and
repeat-seed verifier passed; Python compilation and `git diff --check` passed.
Known dependency/framework deprecation warnings remain the maintenance debt
already recorded in `TODO.md`; no check was weakened.

Railway remains intentionally paused at migrations 001–022. No local stage
completion authorizes deployment or other external mutation.

## Stages 3 and 4 closure evidence — 2026-08-19

Stages 3 and 4 are complete locally. This evidence supersedes the original
defect wording for `QUEUE-01` through `QUEUE-03`, `WAIT-01`, the Stage 3 portion
of `RES-02`, the Stage 4 portions of `ORDER-04`, `ORDER-05` and `INV-05`, and
the Stage 3–4 portions of `REALTIME-01`; it closes `SETTLE-01`.

- Migration 038 adds location/service-day queue policy, service-date indexing,
  tenant-scoped idempotency, append-only queue history, generalized delivery
  attempts and the complete waitlist terminal/audit contract. Public and staff
  queue creation share the locked cover-cap path; the measured median is absent
  below five samples. PostgreSQL coverage proves closed/full behavior, exact
  retries, duplicate-phone denial, reason requirements, unavailable delivery,
  tenant isolation and the final-capacity race in which exactly one join wins.
- Future-waitlist creation reuses authoritative availability, management tokens
  bind the mutable revision, acceptance creates one normal reservation, and
  decline/cancel/remove/history/expiry and email-to-SMS fallback use durable
  delivery state. The expiry job is lock-safe and every read treats elapsed
  offers as expired.
- Queue and reservation sources still converge through
  `POST /api/floor-plan/seatings`; planned assignments do not occupy tables,
  queue state alone cannot seat a party, and reconnect refetches the HTTP Floor
  board. Existing and extended Floor/reservation PostgreSQL tests retain the
  combination, overlap, rollover, Berlin DST, no-show and module-denial proof.
- Migration 039 replaces fixed routing with tenant stations and shared lines,
  snapshots routing on order lines, adds independent line fulfillment and
  exact line-linked stock movements, and records append-only correction,
  cancellation and availability history. Order authority tests cover mixed
  progression, correction-after-preparation denial, exact serve/reversal and
  cancellation behavior without weakening placed tax snapshots.
- Migration 040 replaces simulated closure with `open` and
  `settled_externally`, append-only settlement/reopen events and immutable
  currency/total snapshots. The shared tab lock serializes order mutations and
  settlement; tests prove retry-safe settlement, blocked economic mutation,
  coherent settlement-versus-add races and audited reopen. The frontend uses
  only “Settle externally” language and treats method/reference as optional
  information, never tender or payment state.
- Queue, order and tab projections publish after commit and use WebSocket
  messages as invalidations. Public/staff queue states, dynamic station tickets,
  reasoned correction/cancellation, waitlist terminal states and tab audit/
  reconnect states have mapper and component coverage; a failed optional
  delivery never changes the committed operational result into a success claim.

Final combined verification: 170 PostgreSQL backend tests and 48 frontend tests
passed; frontend lint, TypeScript and Next.js production build passed; the
disposable verifier applied migrations 001–040, seeded twice and passed its
new lifecycle assertions; Python compilation and `git diff --check` passed.
The retained `python-jose`, Node test-runtime and Next.js middleware warnings
remain documented dependency/framework maintenance debt and do not conceal a
failed check. Stage 7 still owns automated cross-browser E2E, the full seeded
pilot scenario and its accessibility/load/failure matrix.

Railway remains intentionally paused at migrations 001–022. No stage completion
authorizes deployment or any other external mutation.

## Stages 3 and 4 public-security evidence — 2026-08-24

The Stage 3–4 journeys remain functionally closed after the public-repository
hardening pass. Migrations 041–043 add hashed queue/order credentials,
per-browser table guest sessions, missing composite tenant constraints, and the
venue privacy-contact production gate without editing migrations 001–040.

- Link credentials are delivered only in fragments and exchanged once for
  purpose-scoped Secure, HttpOnly, SameSite cookies; legacy token-path routes
  are absent. Wrong-purpose, stale-revision, expired, terminal and cross-tenant
  capabilities fail without enumerating another tenant's resource.
- Staff WebSockets open without URL credentials, authenticate in the first
  frame within five seconds, and receive no projection before validation. The
  credential is short-lived, business-bound and unusable as an HTTP staff JWT.
- A registered-table QR creates a bounded pending browser session rather than
  ordering authority. Only staff for the current tenant/seating can approve it;
  denial, seating close/reseat, expiry and QR rotation revoke it. PostgreSQL
  advisory locking, uniqueness and capacity checks remain authoritative when
  Redis limits fail open.
- Public menu, reservation, waitlist, queue, table-session and order responses
  use explicit DTOs with negative assertions for internal identifiers,
  credentials, routing/tax configuration, capacity totals, delivery/provider
  state and settlement internals. Stage 3–4 helpers require business scope and
  the database enforces the new composite tenant relationships.
- Production configuration rejects missing, weak, reused or placeholder staff,
  public-link, table-QR and rate-limit secrets; unsafe CORS, disabled rate
  limiting, absent public origins/privacy contact, or missing internal-service
  credentials stop startup. Production docs and environment disclosure are
  disabled; request/log redaction and global security headers are installed.
- The portfolio exporter reads only an explicit tracked-file allowlist. The
  public surface has synthetic reserved seed data, a local-only demo password
  that never reaches a seed file in plaintext, no reset command, an
  all-rights-reserved view-only license, private-reporting security policy,
  factual controller/processor copy, and an asset-rights
  manifest. Agent state, history, TODO/evidence, plans, deployment state,
  environments, notebooks and undocumented media are excluded.

Final local verification: 188 PostgreSQL backend tests, 51 frontend tests and
6 ML tests passed; frontend lint (two existing navigation warnings), TypeScript
and the Next.js 16.3.2 production build passed; the disposable verifier applied
migrations 001–043 and repeated the synthetic seed; npm audit and both Python
lock audits reported no known vulnerabilities; the digest-pinned non-root ML
image imported LightGBM and Trivy reported zero high/critical OS or Python
findings; workflow YAML, Python compilation, shell syntax and `git diff --check`
passed. Full-history Gitleaks (with one exact documented false-positive
allowlist) and TruffleHog scans found no committed secret. Gitleaks and
TruffleHog also reported zero findings in the complete intended working-tree
portfolio allowlist, which contained no media, notebook, or environment file.

Publication is not yet authorized or complete. Before creating the mirror, the
user must rotate the ignored local OpenAI and Resend keys discovered during the
working-tree audit, commit the intended canonical source, export from that
commit, and run the checklist plus both scanners against the exact export.
Railway and all production credentials remain untouched.

## Stage 5 closure evidence — 2026-08-25

This evidence closes `BUY-01` and the stage-5 half of the `/business/inventory`
route disposition and the `INV` authority. It supersedes the "Verified gaps as of
2026-08-25" list previously carried in `TODO.md`.

- **Migration 048** renames `purchase_price_history.unit_price` to
  `unit_cost_per_base_unit`, comments the three price columns so a per-pack price
  can never be read as a per-base-unit cost, adds the `closed_short` terminal
  state with `closed_at`/`closed_by`/`closure_reason`, adds a request fingerprint
  to receipts, gives `purchase_receipt_lines` the composite tenant key its price
  history rows were missing, adds count-entry provenance columns, and enforces one
  open count session per location with an index that treats a null location as a
  single slot.
- **Supplier order through receiving.** A purchase order was driven draft →
  approved → ordered → partially received → received against a live API. One case
  of 4500 ml at 180.00 EUR moved White Rum from 2625 ml to 7125 ml holding the
  0.04 EUR/ml average; two further cases at 240.00 EUR moved it to 16125 ml at
  0.047442 EUR/ml, which is exactly `(285 + 480) / 16125`. A purchase price change
  did not rewrite historical cost.
- **Retry safety.** Replaying an idempotency key returned the same receipt and
  left the balance unchanged. The same key with a different body was refused
  `409 CONFLICT`. A concurrency test opens two sessions and asserts one receipt,
  one balance and `ledger == stored`. Over-receipt without a discrepancy reason is
  rejected.
- **Terminal states.** A partially received order can be closed short only with a
  reason, records who closed it, and then refuses further transition; an ordered
  order can still be cancelled.
- **Count and explain stock.** A stocktake keyed as 3.4 packs converted to 15300
  ml canonical, reconciled to a −825 ml variance, posted a waste movement and left
  the balance equal to the ledger sum. A negative variance without a shrinkage
  reason is refused. The CSV sheet exported, was edited, and re-imported to 10100
  ml with its reason; a non-numeric quantity was rejected `422` with the row
  number and left every line untouched.
- **Cost and reorder decisions.** Against the seeded tenant: stock on hand
  3580.81 EUR complete, controllable COGS 62.06 sold plus 1169.69 waste with zero
  uncosted movements, and the Happy Hour menu's Mojito at 9.00 EUR costing 2.42 EUR for a
  26.9% pour cost. White Rum is correctly *absent* from reorder suggestions
  because 9000 ml is outstanding on an open order against a 375 ml shortfall —
  the defect where received stock was subtracted twice is gone. Menu items with no
  recipe report `complete=false` with the reason rather than a 100% margin, and a
  suggestion with no supplier lead time reports `lead_time_known=false` with a
  null lead time rather than assuming same-day delivery.
- **Attachments.** A PDF delivery note uploaded, downloaded byte-identical
  through the authenticated route, returned `401` without a token, and a
  `text/plain` upload was rejected `422`. Attachments are stored under a
  storage-relative key, never the public `/uploads` mount.
- **Tenant, role and module boundaries.** HTTP tests assert business A receives
  `403` on every stage-5 read and write addressed to business B, `403
  MODULE_DISABLED` when the inventory module is off, and that ordinary staff
  cannot create suppliers, open counts or read cost figures while still being able
  to list counts. The deleted transfer routes return `404`.
- **Defect discovered by operational verification, not by tests.** The receipt
  response builder ordered by a column the ORM did not map, producing a `500` on
  the real HTTP path while every service-level test passed. Fixed by mapping
  `PurchaseReceiptLine.created_at`, with a regression test that exercises the
  response builder.

**Final combined verification.** 224 PostgreSQL backend tests and 58 frontend
tests passed; frontend lint, TypeScript and the Next.js production build passed;
the disposable verifier applied migrations 001–048, seeded twice and passed its
invariant assertions; the seeded demo tenant's balances were confirmed equal to
the sum of their movement ledgers. Two pre-existing `window.location.assign`
lint warnings in guest-profile and floor clients remain and are unrelated
maintenance debt; they do not conceal a failed check.

Railway remains intentionally paused at migrations 001–022. No stage completion
authorizes deployment or any other external mutation.

## Stage 6 closure evidence — 2026-08-26

This evidence closes `ROLE-01` and `GUARD-01`, and the stage-6 half of the
`/business/insights` and `/business/settings/modules` route dispositions.

- **Migration 049** replaces the three-value role constraint with the five pilot
  roles on both `staff` and `staff_invitations`, backfills every existing
  `staff` row to `host_server` before applying the new constraint, adds
  `withdraw_consent` to the data-request vocabulary, and creates
  `ml_result_snapshots`. Both `DROP CONSTRAINT` steps resolve the auto-generated
  name from `pg_constraint` rather than guessing it. Applied against the real
  development database, which held a live `staff` row: it became `host_server`
  and the new `ck_staff_role` is in place.
- **Authorization is a capability, not a role.** `app/core/permissions.py` maps
  five roles to 47 capabilities; routes ask `require_capability(...)`.
  `require_roles` was deleted after its last caller went. All 253 routes are
  enumerated in [`permission-matrix.md`](permission-matrix.md), generated from
  the running app; every authenticated route names a capability or sits on a
  12-entry exemption list of self-service account and session-context routes,
  and a test fails if that stops being true. Before this change, 137
  authenticated routes had no role guard at all.
- **Each role can do exactly its row, proved over live HTTP.** A running API
  against a freshly migrated and seeded database was called with a real signed
  token for each of the five seeded accounts across 21 representative routes.
  Every allow and every 403 matched the matrix, and no route returned 5xx.
  `host_server` is refused cost control, all reports, staff invitations and tax
  profiles; `bar_kitchen` reads inventory but is refused purchasing writes and
  cost figures; `inventory_operator` manages suppliers and stock but is refused
  the floor board, tabs, guests and every report; every role reaches Overview.
- **The Overview drops its money figure by capability.** `ordered_value_today`
  is present for a manager and absent for a bar/kitchen account on the same
  route — a bartender sees how many tabs are open, not what the venue took.
- **Escalation is refused.** A manager inviting an `owner` and a `manager` was
  refused 403 with "A manager cannot manage the owner role"; the same manager
  inviting a `host_server` succeeded 201.
- **A role change revokes an open session.** A `bar_kitchen` token was refused a
  report 403, the owner promoted that account to manager 200, and the **same
  token** then returned `401 Session is no longer valid` — the change is not
  deferred to the next login.
- **Reports reconcile with their ledgers.** Read as a manager over the seeded
  tenant and checked against SQL by hand: 38 booked / 104 covers / 26 completed
  / 2 cancelled matches `reservations` grouped by status exactly, with rates
  5.3% cancelled and 68.4% completed; queue 12 joined / 8 seated / 4 removed
  with a 22.5-minute median wait matches `queue_entries`; ordered value 753.00
  across 20 orders matches `SUM(total_amount)` over non-cancelled orders; stock
  movements 16 receive / 3 sale / 12 waste and a waste value of 1169.6912 match
  the movement ledger and the stage-5 figure; purchasing 48.00 received matches
  `purchase_receipt_lines`. The three value figures are returned separately and
  never summed; a test asserts no response field is named revenue, accounting,
  fiscal, profit or income.
- **Empty is distinguished from zero.** A range with no bookings returns
  `no_show_rate_percent: null`, not `0`, so "the venue was closed" never renders
  as "no no-shows".
- **Two defects found by the live walk, not by the tests.**
  `reporting_service.table_utilization` selected `Table.name` (the column is
  `label`) and `purchasing_spend` joined `PurchaseReceiptLine.item_id` (it is
  `inventory_item_id`). Both passed every service-level test because those tests
  only asserted a 403 and never built the query. Both 500'd on the first real
  request. Fixed, and `test_every_report_route_answers_over_a_populated_ledger`
  now calls all 15 report routes against a populated ledger and parses each
  response.
- **Guest-led privacy works and does not enumerate.** Against a live server: no
  capability and a forged signature both return the identical
  `404 This link is no longer valid`; the genuine link exchanges 204, reads
  consent state 200, withdraws 201 `completed`, and raises an access request 201
  `pending` — never falsely completed. Repeated withdrawal is idempotent. Every
  recorded request carries a null `requested_by`, truthfully recording that no
  staff member raised it.
- **Consent suppresses marketing and nothing else.** `is_suppressed` returns
  true for a marketing send to a withdrawn guest on each channel and false for
  an operational one. Marketing is opt-in, so a guest with no consent record is
  also suppressed. `sms_service.send_sms` raises rather than sending when passed
  `message_class="marketing"`, so a future campaign cannot be written as a loop
  over the low-level sender.
- **ML degrades against a genuinely dead service.** The `crowbar-ml` container
  has been stopped for weeks. All four Insights reads returned `200` with
  `stale: true` and the reason "The insights service is unreachable and has
  produced no results for this venue yet" instead of the 503 they used to
  return, while `POST /api/insights/run` correctly still returned
  `503 Insights service is unavailable` — there is nothing honest to remember
  about a run that never started. `ml_predictions` is now mapped, so
  `/high-risk` answers `[]` rather than failing on a missing relation.
- **Model policy is enforced, not just documented.** Minimum-data floors are
  module constants (`MIN_CUSTOMERS` 20, `MIN_TRAINING_SAMPLES` 30,
  `MIN_HISTORY_DAYS` 14) that a venue cannot lower; below them a model returns
  no metric and the reason. `ml/tests/test_model_policy.py` asserts the floors,
  segmentation reproducibility over unchanged data, fixed seeds on all three
  models, and that no cancellation or demand feature reads the outcome it
  predicts.

**Defect found here, fixed 2026-08-26.** No seeded demo account could sign in
through `POST /api/auth/login`: the seed used `@example.invalid` addresses and
`LoginRequest.email` is a Pydantic `EmailStr`, which rejects the reserved
`.invalid` TLD with a 422 before the handler runs. It predated stage 6 and
blocked the demo journey rather than the permission matrix, so the role
verification above was driven with tokens minted the way the integration tests
mint them — the same tokens `/api/auth/login` returns, exercising the identical
path from `get_current_user` onward. The seed now uses `@example.com` and
`server/tests/unit/test_seed_credentials.py` reads the seed file and asserts
every address in it passes `LoginRequest`, so a future reserved-TLD address
fails the suite instead of the demo. All five role accounts were afterwards
signed in through the real login route against a freshly seeded database.

**Final combined verification.** 411 PostgreSQL backend tests, 75 frontend tests
and 16 ML tests passed; frontend lint, TypeScript and the Next.js production
build passed; the disposable verifier applied migrations 001–049, seeded twice
and passed its invariant assertions, now including that no legacy `staff` role
survives the backfill. The two pre-existing `window.location.assign` lint
warnings in the guest-profile and floor clients remain and are unrelated
maintenance debt.

**Not exercised.** Table utilization and tab-value figures were reconciled
against a seed that contained no seatings and no tabs, so their populated path
was covered by integration tests rather than by the live walk. Stage 8 part one
closed that gap in the seed: both figures have since been read against seeded
seatings and tabs during a live loop walk. The frontend Reports page was verified by TypeScript,
lint, build and unit tests, not by a browser session. Scheduled jobs were not
run. Redis was up; the ML service was down, which is what made its degradation
observable.

Railway remains intentionally paused at migrations 001–022. No stage completion
authorizes deployment or any other external mutation.

Stage implementations replace these observations with dated command output,
test names, screenshots or recordings where useful, and links to any durable
runbook or CI artifact. Do not mark a risk closed by editing this document
alone.
