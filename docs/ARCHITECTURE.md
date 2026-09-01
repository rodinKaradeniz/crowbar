# Crowbar Architecture

Last verified against the repository and confirmed MVP boundary on 2026-08-25.

## Product Boundary

Crowbar is a modular operations platform for bars and restaurants. A business
is the tenant and can enable reservations, queue, ordering, inventory, and
insights independently. Public guests use slug-based reservation, queue, menu,
and ordering routes; staff use an authenticated business dashboard.

The first release target is a supervised pilot at a single-location German
bar. Crowbar is the operational system through reservations, queue, floor,
orders, externally settled tabs, stock, purchasing, costs, guest context, and
operational reports. A separate compliant register remains payment and fiscal
authority. The MVP does not implement payment processing, a cash register,
receipts/invoices, TSE, DSFinV-K, or fiscal/accounting exports. Implemented
tenant tax profiles are effective-dated operational estimates, not a fiscal
subsystem.

The current tenancy model assumes one active business association per staff
login. Every newly created business receives a primary location, and migration
024 backfills one for existing businesses. Several older module records retain
nullable `location_id` foundations during their gradual cutover, while the
product UI remains effectively single-location.

## Runtime Topology

```text
Browser
  |
  | pages, server components, route handlers
  v
Next.js :3000
  |-- public rewrite /api/backend/* ---------+
  |-- authenticated BFF /api/proxy/* -- JWT |
  |-- server-side typed fetches -------------+--> FastAPI :8000
  |-- docs assistant ----------------------------> OpenAI API (optional)
                                                    |
FastAPI :8000 --------------------------------------+--> PostgreSQL :5432
  |                                                 ^
  +--> private, tenant-scoped ML gateway ----------+--> ML FastAPI :8001
  |                                                 |      |
  +--> Redis :6379 (events + rate limits)            |      +--> PostgreSQL
          |                                         |
          +--> in-process stream consumer --> WS managers
                                                    |
Railway hourly cron --------------------------------+
```

Local Docker Compose uses the explicit project name `crowbar` and starts
PostgreSQL, Redis, and ML. The explicit name prevents Docker from grouping the
stack with unrelated repositories whose Compose directory is also named
`server`. `scripts/dev.sh` starts FastAPI and Next.js as host processes after
running migrations and demo seeds.
The reservation-reminder job is a separate one-shot command. Its Railway Cron
configuration declares an hourly production schedule, but that service is not
deployed while the rollout remains paused.

## Repository Ownership

### `client/`

- `app/`: Next.js App Router pages, layouts, and route handlers.
- `app/business/`: authenticated staff surface.
- `app/{reserve,queue,menu,order}/[business]/`: public guest surfaces.
- `app/api/proxy/[...path]/`: authenticated BFF. It reads the httpOnly JWT and
  forwards an Authorization header to FastAPI.
- `app/api/auth/`: login/register/session routes that own cookie handling.
- `components/`: shared product and UI components.
- `components/ui/`: reusable Radix/shadcn primitives.
- `lib/client-api.ts`: browser API facade. Public calls use the rewrite;
  authenticated calls use the BFF proxy.
- `lib/api-client.ts`: low-level typed FastAPI client using snake_case response
  contracts.
- `lib/api.ts`: server-component facade, auth-cookie access, mock switching,
  and snake_case-to-camelCase mapping.
- `lib/ml-api.ts`: server-side, failure-tolerant insights client. It sends the
  user's JWT to FastAPI and never addresses the private ML service.
- `types/`: shared frontend domain types.
- `docs/DESIGN.md`: visual tokens, typography, responsive interaction, and
  accessibility conventions for product UI work.
- `content/docs/`: MDX end-user docs.
- `scripts/build-doc-chunks.mjs`: builds the docs assistant's checked-in chunk
  index before a production build.
- `tests/`: Vitest, Testing Library, and MSW unit/integration tests.

Middleware provides an early route gate by decoding JWT claims without
verifying the signature. This is a navigation convenience only. Next.js server
components and FastAPI dependencies perform the authoritative auth checks.

### `server/`

- `app/main.py`: FastAPI composition, lifespan, error handlers, request logging,
  CORS, and router registration.
- `app/routers/`: transport, dependencies, response models, and orchestration.
- `app/services/`: domain logic and database operations.
- `app/models/`: async SQLAlchemy ORM models.
- `app/schemas/`: Pydantic wire contracts based on `AppBaseModel`.
- `app/dependencies.py`: JWT authentication, current-business resolution,
  capability checks, and module entitlements.
- `app/core/permissions.py`: the fixed five-role capability matrix. Single
  source of truth for authorization; mirrored to `client/lib/permissions.ts`.
- `app/core/`: Redis client, application rate limiting, domain events, stream
  consumer, WebSocket projections, and structured API errors.
- `app/jobs/reservation_reminders.py`: one-shot, platform-wide reservation
  reminder batch.
- `db/migrations/`: ordered, append-only SQL migrations.
- `db/migrate.py`: custom filename-tracked migration and seed runner.
- `db/seeds/001_seed_example_lantern.sql`: canonical rich demo tenant,
  including the floor plan, seatings and tabs the pilot journey runs on.
- `tests/`: pytest unit and PostgreSQL-backed integration tests.

The async session dependency commits at the end of a successful request and
rolls back on failure. Queue, ordering, tab-order, inventory, reservation
creation, and reservation rescheduling event paths explicitly commit first so
consumers cannot observe uncommitted state. Reservation patch and delete still
rely on request-end commit and need the same correction before those event
types gain a consumer.

### `ml/`

The ML service is an internal FastAPI process with:

- RFM customer segmentation using K-Means.
- Cancellation prediction using LightGBM classification.
- Seven-day demand forecasting using per-business LightGBM regression.

FastAPI derives the tenant from the authenticated staff context and proxies
insights requests to tenant-scoped ML endpoints. The private call includes a
shared service credential outside development. The pipeline requires that
business ID, applies it in its reservation and customer queries, stores output
with the business ID, and keeps latest API results in per-business process
memory. The ML service has no browser CORS surface.

## Core Request Flows

### Tenant-scoped insights

1. Browser mutations use the authenticated Next.js BFF; server components send
   the httpOnly-cookie JWT to FastAPI.
2. FastAPI validates the user, resolves the current business, and enforces the
   insights module entitlement.
3. FastAPI calls the private ML service with the authoritative business ID and
   `X-ML-Internal-Token`.
4. ML data loaders include the business predicate at the SQL source and store
   outputs under that business.

Neither the browser nor a request-supplied business ID selects the ML tenant.

### Authenticated staff HTTP

1. FastAPI login returns a JWT.
2. A Next.js auth route stores it in the `rk-token` httpOnly cookie.
3. Browser code calls `/api/proxy/<backend-path>`.
4. The proxy reads the cookie and attaches `Authorization: Bearer ...`.
5. FastAPI verifies the token, checks the user's current `session_version` and
   active staff assignment, resolves the assignment's business, and applies
   capability/module dependencies. Password/security changes, **role changes**,
   staff removal, and account disablement increment the version so existing HTTP
   and WebSocket credentials stop working immediately — a demotion takes effect
   for a session that is already open, not at the next login.

Do not read the cookie from client JavaScript or treat a browser-supplied
business ID as authority.

Staff accounts enter through the atomic business-owner registration path or a
business-scoped invitation. Invitation and password-reset secrets are stored as
hashes, expire, and are consumed once; request endpoints return generic
responses, while invitation management records truthful send/failure state for
authorized owners/managers. Role mutations prevent self-removal and removal of
the last owner, and derive the tenant from the authenticated assignment rather
than request identifiers.

### Permission model

The venue staffs five fixed roles: `owner`, `manager`, `host_server`,
`bar_kitchen`, and `inventory_operator`, constrained by `ck_staff_role`
(migration 049). A role is not checked directly. `app/core/permissions.py` maps
each role to a set of capability strings, and routes ask for a capability
through `require_capability("purchasing.order.approve")` rather than naming
roles. Call sites therefore state intent, and one module holds every
authorization decision.

The map is hard-coded and resolved at import time. It is not configuration, not
tenant-editable, and has no admin UI — a tenant-configurable RBAC module is a
deferred post-MVP item in `docs/TODO.md`.

Two boundaries are deliberately separate. A capability says what a role may do.
`ROLE_MANAGEMENT_AUTHORITY`, enforced by `staff_service.assert_can_manage_role`,
says which roles an actor may hand out: an owner assigns anything, a manager
assigns only the three operational roles, so a manager can neither promote
someone to their own level nor edit a peer.

Every authenticated route names exactly one capability, apart from a short
recorded exemption list of self-service account and session-context routes.
`docs/permission-matrix.md` is generated from the running app by
`server/scripts/generate_permission_matrix.py` and is the review artifact;
`tests/integration/test_permission_matrix.py` fails when an authenticated route
has neither a capability nor an exemption, so a new route cannot default open.

`client/lib/permissions.ts` mirrors the map so a staff member never sees a
control the API would reject, and `/api/auth/me/context` returns the server's own
capability list so an open session follows a role change. The server is the
authority in every case; the mirror only saves a round trip. A frontend parity
test reads the Python module and fails on drift.

Capabilities do not replace module entitlement or tenancy. A route can carry
all three, and they answer different questions: has the venue bought this, does
this role do this work, and does this row belong to this tenant.

### Public guest HTTP

Public pages resolve the business slug to a UUID on the server. Browser calls
then use `/api/backend/*`, which Next.js rewrites to FastAPI without auth.
Public write endpoints rely on server-side validation, exact public response
projections, explicit business scoping, idempotency, purpose-scoped capability
cookies, and business configuration such as ordering availability. Link
credentials arrive only in URL fragments, are POSTed once to
`/api/public/capabilities/exchange`, and are immediately removed from browser
history. The exchange sets Secure, HttpOnly, SameSite cookies with `__Host-`
names in production. Reservation availability and creation additionally require
the business-level
`public_reservations_enabled` flag; staff reservation workflows do not use that
gate.

FastAPI applies Redis-backed rolling-window limits to authentication, public
reservation, queue, ordering, and related public-read routes when
`RATE_LIMIT_ENABLED=true`. Keys HMAC client IPs, identity values, business IDs,
paths, capabilities, and table sessions before storing them in Redis.
Production trusts Railway's `X-Real-IP`; non-production uses the direct peer
address. A blocked request uses the standard `RATE_LIMITED` error body and
`Retry-After`. Redis failure is logged and fails open so a protection-layer
incident does not take reservations or ordering offline; database uniqueness,
capacity locks, and pending-session caps remain authoritative. The Next.js docs
assistant retains its separate bounded per-process staff limit.

### Regional configuration and operational tax

Migration 037 adds `businesses.country_code`, `currency_code`, `locale`, and
`tax_label`; the existing IANA `timezone`, phone, free-text address, and legal
age complete the tenant region boundary. `app/core/regional.py` validates ISO
country/currency identifiers, BCP 47 locales, IANA zones, currency minor-unit
precision, and country-parsed E.164 phone input. Babel/CLDR supplies public
country/currency options and editable country suggestions. The frontend
`RegionalSettingsProvider`, `money.ts`, and `business-time.ts` carry the stored
values through public and staff presentation. Locale is formatting-only; UI
copy remains English.

`tax_profiles` is the stable tenant/code identity and
`tax_profile_versions` is append-only policy history: name, rate,
inclusive/exclusive flag, effective instant, note, and actor. Owners/managers
manage profiles and explicitly assign every newly priced menu/library item;
there is no runtime food/beverage classifier. Modifier and happy-hour pricing
inherit the menu item's profile. A profile cannot be archived while active
catalogue or library rows reference it. `business_regional_audits` stores the
actor and complete before/after region values.

Currency can change only while the tenant has no menu item, library item,
inventory-cost row, or order. This avoids reinterpreting historical amounts;
an established-tenant conversion needs a future explicit migration/repricing
workflow. The seed's German 19/7/zero examples are editable demo data only.
Non-German businesses receive neutral placeholders and use the same manager
workflow without code changes.

### Guest CRM and retention

`customers` remains the business-scoped, phone-keyed identity boundary.
Reservation creation and phone-bearing queue joins upsert that identity. Guest
profile reads assemble timeline entries from reservations, queue entries, tabs,
orders, and authored guest notes; the profile does not maintain a second copy
of operational events. The `/api/customers` routes derive the business from
the authenticated staff context for every read and mutation. Owners/managers
alone can merge, export, or anonymise profiles; all staff can use operational
notes and profile context.

Migration 029 adds CRM notes, tags, consent provenance, data-request records,
merge audit records, optional profile fields, and anonymisation metadata.
Public reservation capture records independent email/SMS marketing choices
only after the reservation has resolved to its canonical customer. The
one-shot `app.jobs.customer_retention` applies the documented 24-month
inactivity policy from authoritative reservation, queue, tab, and order
activity rather than profile edit time; scheduling it is a deployment concern
and is not assumed by the API process. Concurrent identity resolution is
serialized per tenant/contact key, consent merge is conservative, and tab
orders inherit the canonical customer.

### Reservation protection

Migration 030 extends the booking-schedule replacement contract with
late-change, arrival-grace, reminder, and reconfirmation settings. Reservation
state retains cancellation/no-show/reconfirmation provenance; active capacity
queries continue to use only pending and confirmed rows, so a recorded late
change or no-show releases the same resources immediately. Guest-management
and waitlist-offer credentials are opaque HMAC signatures bound to a mutable
row revision; they never carry the primary staff JWT and are rejected after a
reservation or offer revision changes. Public mutations lock the target row,
revalidate time/state and availability, commit, then publish an event.

`reservation_waitlist_entries` models future reservation interest separately
from queue entries. A host-selected offer expires after 15 minutes and its
acceptance calls the authoritative reservation-creation path, including the
resource claim. The reminder job resolves the service override or business
default and sends transactional email with optional SMS; its existing
legacy `sms_reminder_sent` field remains compatibility state. Migration 036's
`reservation_delivery_attempts` is authoritative per message/channel: each
attempt records count, failure or delivery, successful channels are not sent
twice, and failed channels can be retried independently. Message formatting
uses the business timezone and HTML email escapes user content.

### Real-time operational projections

1. Authenticated browser code requests a short-lived WebSocket token from
   Next.js `/api/ws-token` because the primary JWT is httpOnly. That server
   route exchanges the cookie-backed access token with FastAPI and returns only
   a 120-second, business-bound WebSocket credential.
2. The browser opens WSS without a credential in the URL and sends the token in
   the first authentication frame. FastAPI closes connections that do not
   authenticate within five seconds and emits no operational data first.
   Validation requires `token_use=websocket`, the exact business, current staff
   membership, and a relevant enabled module. The scoped credential is rejected
   by normal HTTP authentication.
3. A queue or order HTTP mutation commits PostgreSQL state.
4. The router publishes a `DomainEvent` to Redis Stream
   `crowbar:events:<database>`. The stream is keyed by the producing
   database so a shared Redis never replays one database's events against
   another's tenants.
5. FastAPI's lifespan consumer group `ws_push` reads the event, re-queries
   current database state, and broadcasts a projection through an in-memory
   queue or order WebSocket manager. Reservation, queue, and `floor_plan.*`
   events also invalidate connected host boards; each board then re-fetches
   its authoritative location/service-day HTTP projection.

Publishing is best-effort: Redis failure does not fail the committed HTTP
mutation. `inventory.*` events currently have no WebSocket projection.

In-memory WebSocket managers imply that horizontal API scaling requires a
shared fan-out design before multiple FastAPI replicas can reliably serve the
same business board.

### Reservation reminders

The checked-in Railway Cron configuration is designed to start
`python -m app.jobs.reservation_reminders` at the beginning of each UTC hour
once deployment resumes. The short-lived process selects confirmed
reservations in the policy's reminder window, locks work with `SKIP LOCKED`,
and creates/updates one `reservation_delivery_attempts` row per enabled email
or SMS channel. Already delivered channels are skipped; failed channels retry
and retain the last error and attempt count. The job renders the venue-local
reservation time, updates the legacy aggregate flag only after all configured
channels succeed, closes its database engine, and exits. There is no Celery
worker or in-process scheduler, and the Railway reminder service is not
currently deployed.

### Reservation availability

Migration 023 and the matching ORM models establish a separate booking domain:

- `booking_schedules` stores one business default plus an optional complete
  override for each service type. Its policy includes minimum notice, advance
  horizon, slot interval, and default duration.
- `booking_schedule_windows` stores multiple Monday=`0` weekly windows and
  represents overnight windows explicitly.
- `booking_schedule_exceptions` and their child windows replace the schedule
  for one business-local calendar date or close that date completely.
- A schedule with no windows is closed. Missing configuration never implies
  24/7 availability.
- `reservations.ends_at` persists the interval accepted at booking time;
  pending and confirmed rows have a partial overlap-query index. Optional
  override actor, reason, and timestamp columns preserve the audit foundation.
- `service_types.max_concurrent_bookings` is now positive and non-null. Legacy
  NULL values migrate to `1`, not unlimited capacity.

`GET /api/availability/business/{business_id}` resolves a service-specific
schedule or its business default, interprets it in the business IANA timezone,
and returns only absolute start/end slots grouped by local calendar date. It
enforces weekly and exception windows, overnight spillover anchored to the
service date, minimum notice, advance horizon, party limits, duration,
the selected resource policy, and active pending/confirmed overlaps. Legacy
types retain their count guard. Cover-backed types sum guests against their
configured cover pool, while table-backed types find the smallest suitable
registered table or active configured combination and include each service's
turn buffer in conflict checks. Window ends are exclusive start-time boundaries;
the accepted reservation interval may end later.

Public and authenticated reservation creation call the same availability
service. Creation locks the resolved schedule row and, for table-backed types,
the active tables in stable order; it then rechecks and persists the exact
server-selected allocation in the same transaction. Creation commits before
publishing and returns `SLOT_UNAVAILABLE` with up to five alternatives when a
slot is stale. New businesses receive a closed default schedule. The public
form fetches live slots and submits the returned absolute timestamp rather than
constructing a browser-local time.

Authenticated `GET /api/booking-schedules` returns the default plus actual
service overrides for the caller's business. Owners/managers can replace a
complete default or service schedule; deleting a service override restores
inheritance. Ordinary staff can inspect schedules but cannot mutate schedules,
booking types, or business-wide booking limits. All mutation scope comes from
`get_current_business`; a body or path business ID is never trusted as the
tenant boundary.

The Profile → Booking editor separates policy, recurring weekly hours, and
date exceptions, and makes inherited versus custom service behavior explicit.
Its operating-hours action first previews a one-time copy, then replaces only
the default schedule's weekly windows. Policy and exceptions remain intact,
and later public operating-hour changes never synchronize silently. Global
party size remains on the business; service capacity, duration, pending mode,
resource policy, turn buffer, and optional booking-count guard remain on
Booking Types.

Authenticated `GET /api/reservations/{id}/availability` derives the tenant and
excludes only that future active reservation when showing replacement slots.
`POST /api/reservations/{id}/reschedule` locks the reservation, then uses the
same schedule-locking slot validator as creation. Booking type, party size,
start, and persisted end change only after the target capacity is claimed; a
conflict rolls the transaction back without releasing the old interval.
Cancelled, completed, and past reservations are not reschedulable.

Generic reservation PATCH is now limited to contact details, notes, and status;
allocation fields are rejected rather than silently bypassing availability.
The shared staff booking dialog creates reservations from Reservations and
Schedule and exposes rescheduling from Reservations, Requests, and Schedule.
Normal creation uses authenticated `GET /api/reservations/availability`; the
server derives the business for reads and writes, and the create body has no
business ID. The dialog renders venue-timezone server slots and handles stale
alternatives. A successful move resets the reminder flag, commits its staff
notification, then schedules customer email with a stable-UID ICS update and
configured SMS before publishing `reservation.rescheduled` best-effort.

Owners/managers alone can call authenticated
`GET /api/reservations/override-times` and submit a required
`availability_override_reason` during staff creation or rescheduling. The
server generates every future time aligned to the resolved schedule interval,
so DST and venue timezone remain authoritative. The override validator still
locks that schedule and enforces tenant, module, service ownership, future
time, interval alignment, and party size, while deliberately bypassing weekly
windows, date exceptions, notice, horizon, and concurrent occupancy. The
reservation stores and returns the actor, actor name, reason, and timestamp;
ordinary staff receive `403` if they attempt the command. A later normal move
clears the current override marker because its replacement interval satisfies
normal availability.

### Operational tables and seatings

Migration 024 evolves the original QR-oriented `tables` record into the shared
physical-resource foundation for reservations, queue, tabs, and ordering:

- `table_areas` groups registered tables within one business location. A table
  has a positive capacity, display shape and order, administrative lifecycle,
  and a current `ready`, `cleaning` (presented as “needs reset”), or
  `out_of_service` condition.
- `table_combinations` defines the exact multi-table sets staff may allocate.
  Overlapping definitions are allowed, but an assignment with multiple tables
  must match one active definition. Its effective capacity is either an
  explicit positive override or the sum of member capacities.
- Reservation and queue assignment tables record advance planning, actor,
  timestamp, and any privileged capacity-override reason. They do not represent
  occupancy.
- `table_seatings` represents actual occupancy and links exactly one active
  reservation or queue party to one or more tables. Opening a seating uses the
  same assignment and capacity rules. Future reservation planning uses its
  planned interval rather than a table's current occupancy. Closing a seating
  completes the source visit and returns its tables to ready; staff can
  explicitly mark a table as needing reset when appropriate.

All floor-plan queries derive the business from authenticated staff context.
Configuration mutations require owner or manager; operational state,
assignment, and seating actions are available to staff. The cross-module API is
available when reservations, queue, or ordering is enabled, with source actions
also enforcing their owning module. The initial product remains area-based and
single-location in its UI; visual coordinates and multi-location management are
not part of this foundation.

Migration 025 adds `businesses.service_day_cutoff`, a business-local wall-clock
boundary that defaults to 05:00. The host board resolves an explicit date or,
by default, the current service date in the venue IANA timezone; before cutoff,
the previous calendar date still owns the shift. It converts each local
boundary independently, so DST transitions produce correct absolute windows.
Legacy reservation/queue rows without a location appear only on the primary
location board; new records receive that primary location explicitly.

`GET /api/floor-plan/board` is the authoritative snapshot. It combines active
areas/tables, reservation and queue assignments, open seatings, operational
conditions, current/next reservations, and unassigned parties. A dedicated
staff WebSocket broadcasts only `floor_plan_updated`; clients re-fetch the
snapshot and retain normal HTTP retry/fallback behavior instead of treating
socket messages as state.

The authenticated dashboard exposes this projection at `/business/floor`.
Every staff member with an enabled operational module can run the host board;
owners and managers also see the Floor setup view for areas, tables,
combinations, and service-day cutoff. The area-based board stays responsive
without a geometry editor. Its shared table-selection sheet is the only staff
path that seats a queue party, so it opens a real `table_seating` instead of
only changing queue status. The Queue page keeps notification and no-show work,
but its former table-less accept/seat commands are removed.

Migration 028 establishes registered-table order continuity without rewriting
historical order labels. Migration 041 changes the signed, revision-bound QR
from direct ordering authority into a pending browser-session bootstrap. The
session stores only a browser nonce hash, is bound to business, location,
table, and active seating, and must be approved by eligible staff before its
purpose-scoped cookie can order. Denial, expiry, seating closure/reseat, or QR
rotation revokes it. Session expiry uses the bounded
`TABLE_GUEST_SESSION_TTL_MINUTES` deployment setting (30 minutes through 24
hours). `tabs.seating_id` establishes one open tab per seating via a partial
unique index. Approved guest rounds create or reuse that tab under a seating
row lock; staff can do the same through the authenticated Floor → Tabs handoff.
Orders persist the authoritative registered `table_id` and `tab_id`; their
legacy `table_identifier` stays nullable read-only compatibility data. Closing
a seating locks and rejects an open seating tab, so settlement precedes the
source visit's completion. QR rotation increments the table revision and
invalidates earlier credentials without storing a reusable public secret.

Migration 040 replaced simulated closure with an audited
`settled_externally` assertion and immutable total snapshot. It must not grow
tender, cash, card, receipt, refund, or fiscal semantics; those belong to the
separate post-MVP German POS/payment program.

### Authoritative order placement

Public QR rounds and staff tab rounds call the same order service. It resolves
the active business menu, category, item, modifier group and modifier rows,
validates required/min/max selections and registered table/tab context, and
computes item names, happy-hour price and modifier deltas from server-owned
data. A missing, foreign, inactive, unavailable, unpublished or mixed-invalid
cart rejects atomically before an order, event, stock movement or tab effect is
created.

Each order stores a canonical request fingerprint. Idempotency keys are unique
within a business: exact retries return the existing order without publishing
another event, different requests using the same key conflict, and concurrent
public/staff retries converge on one persisted order.

At the same server-owned resolution point, placement resolves the effective
tax-profile version after happy-hour and modifier pricing. Each line is rounded
half-up to the configured currency minor unit and snapshots currency,
profile/version IDs, profile name/code, rate, inclusion policy, net subtotal,
tax, and gross total. The order stores summed subtotal/tax/total and currency.
Mixed inclusive/exclusive profiles are supported; later profile or menu changes
cannot rewrite placed lines. These values are operational/non-fiscal and the
client preview never becomes calculation authority.

### Inventory and order fulfillment

- Countable inventory uses `unit_type=each`.
- `bottle` and `keg` quantities, par levels, recipe quantities, and movements
  use milliliters.
- Menu recipes are replace-all rows in `menu_item_ingredients`.
- Entering `served` generates `sale` stock movements.
- Leaving `served` for the previous state generates `sale_reversal` movements
  from the order's actual outstanding recorded deductions.
- Deduction/reversal is best-effort and must not block a service status change.
- Items depleted to zero are auto-disabled and must be manually re-enabled.
- `inventory_items.current_quantity` is a maintained balance updated with each
  movement under a row lock. The reconciliation job compares that balance to
  the movement ledger and persists visible discrepancies; it is not the normal
  read path.
- Inventory items archive rather than delete, recipe replacement rejects the
  whole request when any ingredient is invalid or foreign, low-stock alerts
  trigger only on threshold crossings, and served-deduction failures persist
  an order-linked discrepancy without blocking fulfillment.
- Item-library entries are templates. Adding one to a menu copies its values
  into a new business-owned menu item rather than retaining a live link, so a
  later template edit cannot silently change an active menu.

Tab totals, recipe servings remaining, and reference pours remaining are
computed rather than denormalized.

### Purchasing, pack conversion and cost basis

- Suppliers, supplier products, purchase orders and receipts are tenant-owned
  rows reached through `/api/purchasing/{business_id}/...`. The router carries
  `require_module("inventory")`; purchasing is a feature of that module, not a
  module of its own.
- Purchase order and receipt quantities count **packs**, and their `unit_price`
  is per pack. `purchase_price_history.unit_cost_per_base_unit` is per canonical
  base unit. Conversion between the two always goes through the pack
  conversion's `base_quantity`.
- Receiving locks the purchase order, re-checks the idempotency key **under that
  lock**, and compares a request fingerprint so a replayed key with a different
  body is refused rather than silently returning the first receipt.
- A receipt writes an ordinary positive `receive` movement through
  `inventory_service.apply_movement`, which recomputes the item's moving
  weighted average cost. Receipts never write a balance directly.
- A receipt cannot stamp a movement with a location that contradicts where the
  item is stocked. Order status is recomputed from line quantities, never taken
  from the request.
- Purchase order status transitions are an explicit map. `received`,
  `closed_short` and `cancelled` are terminal; `closed_short` requires a reason
  and exists so an order that ends incomplete does not claim nothing arrived.
- Supplier products carry `lead_time_days`, which is the forecast term in reorder
  suggestions. Archiving a supplier is refused while it has open orders.
- Attachments store a storage-relative object key and are served only through an
  authenticated tenant-scoped route, never the public `/uploads` mount.

### Stocktakes and cost control

- Opening a count session seeds one line per selected active item from the
  current book quantity. A partial unique index allows only one open session per
  location, and treats a null location as a single slot.
- Counts may be keyed in canonical base units, in packs (an open bottle is a
  fraction), or as a keg level. The service converts to base units and preserves
  what was keyed in `entry_mode`, `entry_value` and `entry_pack_conversion_id`.
- Saving lines and reconciling both take the session row lock, so a save cannot
  interleave with a reconcile reading the same lines.
- Reconciling re-reads each book quantity **under lock** rather than trusting the
  figure seeded when the session opened, then posts the difference as an ordinary
  `adjust` or `waste` movement. A negative variance requires a shrinkage reason.
- The CSV count sheet exports and imports the same shape. An import is validated
  whole and rejected whole: a half-imported stocktake is worse than none.
- Cost figures are read-only derivations over movement and order facts. Money
  totals quantize half-up at the tenant currency's minor unit; per-base-unit
  costs do not, because rounding them to cents would misstate consumption.
- Every cost payload carries the non-fiscal disclosure and a `complete` flag with
  the specific reason it is not complete. No figure substitutes zero for a
  missing cost, recipe or lead time.

### Operational reporting

`app/services/reporting_service.py` derives every report at read time from the
ledgers the service loop already writes — reservation statuses and no-show
columns, queue transitions, seatings, order lines and their status timeline,
settlement events, stock movements, count lines, purchase receipts. Nothing is
denormalized and no report writes.

Every route takes a required `start`/`end` window and echoes it back, so a figure
on screen always carries the range it covers. `reporting_service.Window` rejects
a backwards range with 422. Guards split three ways: `reports.service` for floor
outcomes, `reports.cost` for stock and purchasing, `reports.staff_actions` for
who did what, each combined with the module that owns the underlying data.

Value reporting keeps three figures apart and never sums them: ordered value from
`orders.total_amount`, open-tab value from orders on tabs still `open`, and
externally settled value from `tab_settlement_events.total_snapshot` — the
immutable amount captured when the venue's own register took payment, never
recomputed from orders. Every response carries `complete`, the specific reason
when it is false, and a disclosure the client renders verbatim.

Staff-action reporting reads the actor columns that already exist on purchase
orders, receipts, count sessions, settlement events and reservations. There is no
audit-event table; a platform-wide audit explorer is deferred.

`app/core/csv_export.py` renders every export: a buffered `csv.DictWriter` to a
string, served as a plain `Response` with a download filename and
`Cache-Control: private, no-store`. Buffered rather than streamed so a failure
happens before any bytes reach the client, and because each export is bounded by
one venue's ledger over one date range.

### ML result snapshots

`app/routers/insights.py` proxies the private ML service and snapshots each
successful read into `ml_result_snapshots` (migration 049), one row per tenant
and resource. When the service is unreachable the router serves that snapshot
with `stale: true` and its `captured_at`, or an honest empty state when there is
nothing remembered — never a 503 to the dashboard. An error *response* from a
reachable service is passed through unchanged, because it is a real answer.
`POST /api/insights/run` keeps its 503: there is nothing honest to remember
about a run that never started.

## Data and Migration Model

The custom migrator sorts `*.sql` filenames and records applied filenames in
`_migrations`. Add the next zero-padded migration; do not rename or modify an
already-applied migration. Models and Pydantic schemas must be updated in the
same change.

Backend integration tests do not run migrations. Their autouse fixture creates
and drops ORM metadata in a dedicated `crowbar_test` PostgreSQL database. This
means both migrations and ORM metadata require deliberate validation.

Migrations 023–049 are implemented locally. On 2026-08-25 the repeatable
`scripts/verify-fresh-db.sh` check applied the full 001–048 chain, ran the
canonical synthetic seed twice, asserted its schema/relationship invariants,
and cleaned the disposable database. The seed still lacks the complete Stage
8 pilot scenario and therefore does not prove the full MVP demo journey.
Railway remains at migrations 001–022 while deployment is paused.

Migrations 005 and 006 were renamed early in the project. A database restored
from an old backup may still contain their former names in `_migrations`; use
the compatibility procedure in `server/DATABASE.md` before running the current
migration chain.

## Optional and External Services

- PostgreSQL 16: authoritative product and ML data.
- Redis 7: domain-event stream for WebSocket projections and application
  rolling-window rate limits.
- Resend: email; configuration is optional and services degrade gracefully.
- Twilio: SMS; optional and failure-tolerant.
- OpenAI: optional staff docs assistant in a Next.js server route. It is hidden
  and returns 404 unless both an explicit enable flag and API key are present;
  authenticated use has bounded history/message/output sizes and a per-process
  staff rate limit. It embeds checked-in MDX chunks in process memory and calls
  Chat Completions. Stage 7 still owns distributed production abuse controls.
- Local file storage: `storage_service.py`; S3 is only an intended extension.
- Payment provider packages and payment data paths are absent from the MVP.
  Tab closure is the Stage 4 external-settlement assertion; it does not
  authorize payment work.

## Delivery State

Railway is the confirmed deployment target. Managed PostgreSQL, Redis, and the
public FastAPI service are online in EU West; API health and migrations 001–022
were verified there. Next.js, ML, reminders, retention scheduling, and durable
uploads are not deployed, and the local rate-limit implementation is not
active in Railway until its code is deployed with `RATE_LIMIT_ENABLED=true`.
The rollout remains paused until MVP stages 0–8 pass locally and the user
explicitly authorizes deployment work. `docs/deployment.md` records the resume
point. Production readiness still requires web origin/CORS, secrets, durable
storage, private ML networking, backups/restore, observability, job/delivery
alerts, release recovery, and an explicit single-replica or shared WebSocket
fan-out decision.
