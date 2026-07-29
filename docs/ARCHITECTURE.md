# Crowbar Architecture

Last verified against the repository on 2026-07-28.

## Product Boundary

Crowbar is a modular operations platform for bars and restaurants. A business
is the tenant and can enable reservations, queue, ordering, inventory, and
insights independently. Public guests use slug-based reservation, queue, menu,
and ordering routes; staff use an authenticated business dashboard.

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
The reservation-reminder job is a separate one-shot command in every
environment and is scheduled hourly by Railway in production.

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
- `app/dependencies.py`: JWT authentication, current-business resolution, role
  checks, and module entitlements.
- `app/core/`: Redis client, application rate limiting, domain events, stream
  consumer, WebSocket projections, and structured API errors.
- `app/jobs/reservation_reminders.py`: one-shot, platform-wide reservation
  reminder batch.
- `db/migrations/`: ordered, append-only SQL migrations.
- `db/migrate.py`: custom filename-tracked migration and seed runner.
- `db/seeds/001_seed_puzzles.sql`: canonical rich demo tenant.
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
5. FastAPI verifies the token, loads the user, resolves the first staff
   assignment's business, and applies role/module dependencies.

Do not read the cookie from client JavaScript or treat a browser-supplied
business ID as authority.

### Public guest HTTP

Public pages resolve the business slug to a UUID on the server. Browser calls
then use `/api/backend/*`, which Next.js rewrites to FastAPI without auth.
Public write endpoints therefore rely on server-side validation, explicit
business scoping, idempotency/session tokens where implemented, and business
configuration such as ordering availability. Public reservation availability
and creation additionally require the business-level
`public_reservations_enabled` flag; staff reservation workflows do not use that
gate.

FastAPI applies Redis-backed rolling-window limits to authentication, public
reservation, queue, ordering, and related public-read routes when
`RATE_LIMIT_ENABLED=true`. Keys HMAC client IPs, identity values, business IDs,
paths, and opaque session tokens before storing them in Redis.
Production trusts Railway's `X-Real-IP`; non-production uses the direct peer
address. A blocked request uses the standard `RATE_LIMITED` error body and
`Retry-After`. Redis failure is logged and fails open so a protection-layer
incident does not take reservations or ordering offline. The Next.js docs
assistant has no equivalent control yet.

### Real-time operational projections

1. Authenticated browser code requests a short-lived WebSocket token from
   Next.js `/api/ws-token` because the primary JWT is httpOnly. That server
   route exchanges the cookie-backed access token with FastAPI and returns only
   a 120-second, business-bound WebSocket credential.
2. FastAPI requires `token_use=websocket`, the exact business, current staff
   membership, and a relevant enabled module. The scoped credential is
   rejected by normal HTTP authentication.
3. A queue or order HTTP mutation commits PostgreSQL state.
4. The router publishes a `DomainEvent` to Redis Stream `crowbar:events`.
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

Railway starts `python -m app.jobs.reservation_reminders` at the beginning of
each UTC hour. The short-lived process selects confirmed reservations 23–25
hours ahead with `sms_reminder_sent=false`, checks the business SMS channel,
sends through Twilio, marks successful deliveries, closes its database engine,
and exits. There is no Celery worker or in-process scheduler.

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
concurrency, and active pending/confirmed overlaps. Window ends are exclusive
start-time boundaries; the accepted reservation interval may end later.

Public and authenticated reservation creation call the same availability
service. Creation locks the resolved schedule row with `SELECT ... FOR UPDATE`,
rechecks capacity, persists the server-selected interval, commits it before
publishing, and returns `SLOT_UNAVAILABLE` with up to five alternatives when a
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
and positive concurrency remain on Booking Types.

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
  and a current `ready`, `cleaning`, or `out_of_service` condition.
- `table_combinations` defines the exact multi-table sets staff may allocate.
  Overlapping definitions are allowed, but an assignment with multiple tables
  must match one active definition. Its effective capacity is either an
  explicit positive override or the sum of member capacities.
- Reservation and queue assignment tables record advance planning, actor,
  timestamp, and any privileged capacity-override reason. They do not represent
  occupancy.
- `table_seatings` represents actual occupancy and links exactly one active
  reservation or queue party to one or more tables. Opening a seating uses the
  same assignment and capacity rules. Closing it completes the source visit and
  puts its tables into cleaning; a later explicit staff action marks them ready.

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
  movement. `recompute_quantity_from_movements` exists for reconciliation; it
  is not the normal read path.
- Item-library entries are templates. Adding one to a menu copies its values
  into a new business-owned menu item rather than retaining a live link, so a
  later template edit cannot silently change an active menu.

Tab totals, recipe servings remaining, and reference pours remaining are
computed rather than denormalized.

## Data and Migration Model

The custom migrator sorts `*.sql` filenames and records applied filenames in
`_migrations`. Add the next zero-padded migration; do not rename or modify an
already-applied migration. Models and Pydantic schemas must be updated in the
same change.

Backend integration tests do not run migrations. Their autouse fixture creates
and drops ORM metadata in a dedicated `crowbar_test` PostgreSQL database. This
means both migrations and ORM metadata require deliberate validation.

Migrations 023–025 are implemented and validated locally against disposable
fresh databases (023 also with the canonical seed). Railway remains at
migrations 001–022 while deployment is shelved.

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
- OpenAI: optional staff docs assistant in a Next.js server route. It embeds the
  checked-in MDX chunks in process memory and calls Chat Completions.
- Local file storage: `storage_service.py`; S3 is only an intended extension.
- Stripe packages remain in the frontend manifest, but payment data paths were
  removed by migration 013 and settlement is currently simulated.

## Delivery State

Railway is the confirmed deployment target. Managed PostgreSQL, Redis, and the
public FastAPI service are online in EU West; the API health check and current
migration chain have been verified. Next.js, ML, reminders, and durable uploads
are not deployed yet, and the local rate-limit implementation is not active in
Railway until its code is deployed with `RATE_LIMIT_ENABLED=true`.
The rollout is intentionally shelved while product development continues;
`docs/deployment.md` records the resume point. Production readiness work must
still account for the web origin and CORS, secret management, storage, private
ML networking, backups, observability, and multi-replica WebSocket behavior.
