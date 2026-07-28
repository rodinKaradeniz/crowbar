# Crowbar Agent Guide

This is the repository-wide entry point for coding agents. It is intentionally
short: use it to find the authoritative context, then read only the documents
needed for the task.

## Start Here

Before changing code:

1. Read [docs/RULES.md](docs/RULES.md) on every pass.
2. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for any code, data, or
   infrastructure change.
3. Check [docs/TODO.md](docs/TODO.md) when planning or choosing scope.
4. Check [docs/HISTORY.md](docs/HISTORY.md) before changing an established
   behavior or revisiting an earlier decision.
5. Inspect `git status --short` and preserve unrelated work already in the
   worktree.

For focused work, also read:

- Database or migrations: `server/DATABASE.md`
- ML service or insight models: `ml/CONTEXT.md`
- Deployment: `docs/deployment.md` (verified runbook and partial rollout state;
  deployment remains an explicit user-authorized activity)
- Product UI or visual language: `docs/DESIGN.md`
- Project-specific agent skills: `docs/SKILLS.md`

`README.md` is the human quick start. When documentation disagrees with
executable source, inspect the source and update the stale document.

## Confirmation Before Development

- Do not silently assume missing product behavior, scope, user experience,
  architecture, data semantics, or acceptance criteria.
- Read-only investigation is allowed before confirmation. Do not begin
  implementation while a material ambiguity or unresolved choice remains.
- When the user proposes a possible implementation shape rather than a fixed
  requirement (for example, a modal or sidebar), compare it with modern
  alternatives such as a dropdown, popover, sheet, inline flow, command menu,
  or dedicated page. Explain the recommendation and material tradeoffs, then
  ask the user to confirm the direction before editing code.
- Treat a clear, explicit user instruction as confirmation. Do not ask the user
  to reconfirm facts or choices they have already specified.
- Ask focused questions in one batch where practical. State what is known, what
  is unknown, and which answers would change the implementation.

## Project in One Minute

Crowbar is a multi-tenant operations platform for bars and restaurants:

- `client/`: Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Radix and
  shadcn/ui.
- `server/`: FastAPI, async SQLAlchemy, PostgreSQL, Redis Streams, WebSockets,
  and short-lived scheduled jobs.
- `ml/`: internal FastAPI service using pandas, scikit-learn, and LightGBM
  against the main PostgreSQL database.
- `server/db/migrations/`: ordered SQL migrations run by a custom migrator; no
  Alembic.
- `scripts/dev.sh`: starts PostgreSQL, Redis, and ML in Docker, then starts the
  backend and frontend natively. It does not run scheduled jobs.

Default local ports are frontend `3000`, backend `8000`, ML `8001`,
PostgreSQL `5432`, and Redis `6379`.

## Current Checkpoint

The current product priority is the operational loop, in this confirmed order:

1. Authoritative reservation availability and capacity.
2. Floor plan and table management.
3. Rich guest CRM.
4. No-show and reservation protection.
5. Purchasing and cost control.
6. POS and payment integrations.

Start with discovery and product-rule confirmation for the current stage; do
not silently pull a later stage forward. `docs/TODO.md` owns the detailed
acceptance boundary and the remaining planned improvements after this arc.

Availability stage checkpoint as of 2026-07-28:

- Local migration 023 and matching ORM/Pydantic contracts establish business
  default and service-override booking schedules, weekly/date windows,
  persisted reservation intervals, positive concurrency, and override audit
  fields. The fresh migration-plus-seed chain is locally validated.
- The shared availability service and public read endpoint enforce timezone,
  weekly/date windows, notice/horizon, party limits, duration, active-overlap
  concurrency, and service overrides. Public and authenticated creation lock
  the resolved schedule, recheck capacity, persist the selected interval, and
  return structured alternatives on a stale slot.
- The public reservation form now uses only server-returned slots and displays
  them in the venue timezone. New businesses receive a closed default schedule.
- Authenticated schedule APIs and Profile → Booking now manage the default and
  explicit service overrides, including policy, split/overnight weekly hours,
  date exceptions, and a previewed one-time operating-hours copy. Owners and
  managers edit; ordinary staff view read-only. Booking Types also exposes
  positive concurrency and its mutations are tenant/role scoped.
- Staff rescheduling now uses authenticated reservation-specific availability
  and a dedicated atomic command across Reservations, Requests, and Schedule.
  It locks the reservation and schedule, excludes the old interval, rejects
  terminal/past moves, preserves the old booking on conflict, and commits
  before updated email/ICS, SMS, and event side effects. Generic PATCH no longer
  accepts allocation fields.
- Reservations and Schedule now provide a shared staff New Reservation flow.
  Ordinary staff use normal server slots; owners/managers can deliberately
  choose server-generated override times with a required reason. The server
  derives the tenant, enforces hard service/party/time constraints, records the
  actor/reason/timestamp, and surfaces the audit marker to staff. Floor-plan
  and table management is the next product stage.
- Migration 023 is local only. Railway remains at migrations 001–022 because
  deployment is shelved.

Railway rollout is intentionally shelved as of 2026-07-25:

- Project `crowbar` is in workspace `Rodin Karadeniz's Projects`.
- Three services are online in EU West: private `Postgres`, private `Redis`,
  and public `api`.
- The API domain is
  `https://api-production-e3f8a.up.railway.app`; health, database connectivity,
  migrations 001–022, and the Redis stream consumer were verified.
- `web`, `ml`, reminders, and durable object storage are not deployed. A web
  service was not partially created when the trial provisioning limit was hit.
- Redis-backed FastAPI rate limiting is implemented and verified locally, but
  that local change is not deployed or enabled on Railway.

Do not resume Railway provisioning, configuration, or deployment until the
user explicitly reopens that arc. See `docs/deployment.md` for the exact
handoff state.

## Commands

```bash
# Full development stack from the repository root
./scripts/dev.sh

# Frontend
cd client
npm run dev
npm run lint
npm run test:run
npm run build

# Backend (runtime dependencies)
cd server
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Backend tests (test dependencies are a separate manifest)
venv/bin/python -m pip install -r requirements-test.txt
docker exec crowbar-db createdb -U postgres crowbar_test  # one-time
venv/bin/python -m pytest

# Safe migration path
cd server
venv/bin/python -m db.migrate

# Reservation reminder batch (mutates data and may send SMS)
cd server
venv/bin/python -m app.jobs.reservation_reminders
```

Do not run `python -m db.migrate reset`, delete Docker volumes, seed shared
databases, or use destructive Git commands unless the user explicitly requests
it.

## Non-Negotiable Architecture Rules

- Scope every protected backend operation to the business resolved by
  `get_current_business`. Never trust a request body or path business ID as the
  authorization boundary.
- Guard module-owned backend routes with `require_module(...)` and module-owned
  dashboard pages with the shared frontend module guard.
- Keep route handlers thin, domain behavior in `server/app/services/`, wire
  contracts in `schemas/`, and persistence in `models/`.
- Add schema changes as a new ordered SQL migration. Never edit an applied
  migration to change production state.
- Commit database mutations before publishing `DomainEvent`s. Event publishing
  is best-effort and drives WebSocket projections through Redis Streams.
- Keep the JWT in the `rk-token` httpOnly cookie. Browser-side authenticated
  calls go through the Next.js proxy; do not expose the token to client code.
- Keep ML private. Browser and frontend code call the authenticated FastAPI
  insights gateway; FastAPI derives the business ID and ML loaders enforce it
  at the SQL source.
- Preserve API snake_case and map to frontend camelCase at the API boundary.
- Use `AppBaseModel` for Pydantic schemas and `toMoney()` /
  `toOptionalMoney()` for frontend money mapping.
- Use the canonical Monday=`0` day helpers in `server/app/constants/days.py`
  and `client/lib/days.ts`.
- Write customers through `customer_identity_service.upsert_customer`; customer
  identity is business-scoped and phone-keyed.
- Liquids are canonical milliliters in storage and APIs. `bottle` and `keg`
  select UI presets; they do not use different inventory math.
- Inventory deductions and reversals happen at the `served` boundary and use
  recorded stock movements. Do not recompute a reversal from the current
  recipe.
- Keep table planning separate from occupancy: reservation/queue assignments
  plan tables, while an open seating owns actual occupancy. Multi-table sets
  must match an active configured combination, and capacity overrides require
  an owner/manager with an audit reason.

## Definition of Done

A change is complete when:

1. The implementation follows the existing layer and naming conventions.
2. Relevant tests, lint, type/build checks, or targeted manual checks pass.
3. Tenant isolation, module entitlement, auth, failure, and real-time effects
   were considered where applicable.
4. Public/backend contract changes update both mappers/types and tests.
5. Schema changes include a forward migration and model/schema alignment.
6. `docs/HISTORY.md` records durable decisions and `docs/TODO.md` reflects any
   newly deferred work; routine code changes do not need documentation churn.
7. The handoff reports what changed, what was verified, and any remaining risk.
