# Crowbar Architecture

Last verified against the repository on 2026-07-26.

## Product Boundary

Crowbar is a modular operations platform for bars and restaurants. A business
is the tenant and can enable reservations, queue, ordering, inventory, and
insights independently. Public guests use slug-based reservation, queue, menu,
and ordering routes; staff use an authenticated business dashboard.

The current tenancy model assumes one active business association per staff
login. Database tables include nullable `location_id` foundations, but the
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

Local Docker Compose starts PostgreSQL, Redis, and ML. `scripts/dev.sh` starts
FastAPI and Next.js as host processes after running migrations and demo seeds.
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
rolls back on failure. Queue, ordering, tab-order, and inventory event paths
explicitly commit first so the stream consumer cannot project uncommitted
state. Reservation routes currently publish after `flush()` but before the
dependency's request-end commit; this is a known ordering gap, even though
reservation events do not yet have a WebSocket projection.

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
configuration such as ordering availability.

FastAPI applies Redis-backed rolling-window limits to authentication, public
reservation, queue, ordering, and related public-read routes when
`RATE_LIMIT_ENABLED=true`. Keys HMAC client IPs, identity values, business IDs,
paths, and opaque session tokens before storing them in Redis.
Production trusts Railway's `X-Real-IP`; non-production uses the direct peer
address. A blocked request uses the standard `RATE_LIMITED` error body and
`Retry-After`. Redis failure is logged and fails open so a protection-layer
incident does not take reservations or ordering offline. The Next.js docs
assistant has no equivalent control yet.

### Real-time queue and orders

1. Authenticated browser code requests a short-lived WebSocket token from
   `/api/ws-token` because the primary JWT is httpOnly.
2. FastAPI validates that token at the WebSocket endpoint.
3. A queue or order HTTP mutation commits PostgreSQL state.
4. The router publishes a `DomainEvent` to Redis Stream `crowbar:events`.
5. FastAPI's lifespan consumer group `ws_push` reads the event, re-queries
   current database state, and broadcasts a projection through an in-memory
   queue or order WebSocket manager.

Publishing is best-effort: Redis failure does not fail the committed HTTP
mutation. `inventory.*` and `reservation.*` events are recorded but currently
have no WebSocket projection. Reservation routes need commit-order correction
before those events gain a consumer.

In-memory WebSocket managers imply that horizontal API scaling requires a
shared fan-out design before multiple FastAPI replicas can reliably serve the
same business board.

### Reservation reminders

Railway starts `python -m app.jobs.reservation_reminders` at the beginning of
each UTC hour. The short-lived process selects confirmed reservations 23–25
hours ahead with `sms_reminder_sent=false`, checks the business SMS channel,
sends through Twilio, marks successful deliveries, closes its database engine,
and exits. There is no Celery worker or in-process scheduler.

### Reservation availability foundation

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

The current reservation service derives `ends_at` from service duration, then
the business reservation duration fallback, so the new database invariant does
not break existing writes. The shared slot computation, transactional conflict
protection, availability/read endpoints, override authorization, and booking UI
are the next slice. Until those land, existing reservation endpoints still
accept caller-selected timestamps and must not be described as enforcing the
new schedule.

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

Migration 023 is implemented and validated locally against a disposable fresh
database plus the canonical seed. Railway remains at migrations 001–022 while
deployment is shelved.

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
