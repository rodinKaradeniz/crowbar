# Crowbar Architecture

Last verified against the repository on 2026-07-23.

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
  |-- ML server-component fetches ----------------> ML FastAPI :8001
                                                     |
FastAPI :8000 ---------------------------------------+--> PostgreSQL :5432
  |                                                      ^
  +--> Redis :6379 (events, Celery broker/backend)        |
          |                                               |
          +--> in-process stream consumer --> WS managers |
          +--> Celery worker/beat ------------------------+

ML FastAPI :8001 -----------------------------------------> PostgreSQL :5432
```

Local Docker Compose starts PostgreSQL, Redis, and ML. `scripts/dev.sh` starts
FastAPI and Next.js as host processes after running migrations and demo seeds.
Celery worker and beat are separate manual processes.

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
- `lib/ml-api.ts`: server-side, failure-tolerant ML client with a five-minute
  Next.js cache.
- `types/`: shared frontend domain types.
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
- `app/core/`: Redis client, domain events, stream consumer, WebSocket
  projections, and structured API errors.
- `app/celery_app.py`: hourly reservation reminder scheduler and task.
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

The pipeline reads the main database with a synchronous SQLAlchemy connection
for pandas, exposes an async health check, stores durable outputs in
`ml_predictions` and `business_daily_metrics`, and keeps the latest API result
in process memory. Its endpoints have no application auth and must remain on a
trusted network in production.

## Core Request Flows

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

Celery beat schedules an hourly sweep. The worker selects confirmed
reservations 23–25 hours ahead with `sms_reminder_sent=false`, checks the
business SMS channel, sends through Twilio, and marks successful deliveries.
The current async task wrapper is intended for the development `solo` pool and
needs production pool validation.

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

## Optional and External Services

- PostgreSQL 16: authoritative product and ML data.
- Redis 7: domain-event stream plus Celery broker/result backend.
- Resend: email; configuration is optional and services degrade gracefully.
- Twilio: SMS; optional and failure-tolerant.
- OpenAI: optional staff docs assistant in a Next.js server route. It embeds the
  checked-in MDX chunks in process memory and calls Chat Completions.
- Local file storage: `storage_service.py`; S3 is only an intended extension.
- Stripe packages remain in the frontend manifest, but payment data paths were
  removed by migration 013 and settlement is currently simulated.

## Delivery State

There is no checked-in CI workflow, backend production Dockerfile, or
production Compose file. `docs/deployment.md` describes a proposed Vercel +
EC2/GitHub Actions topology, not current deployed infrastructure. Production
readiness work must account for HTTPS, secret management, CORS, storage,
private database/Redis/ML networking, migrations, worker processes, backups,
observability, and multi-replica WebSocket behavior.
