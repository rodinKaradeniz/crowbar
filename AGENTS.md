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
- Deployment: `docs/deployment.md` (a plan, not deployed infrastructure)
- Project-specific agent skills: `docs/SKILLS.md`
- Detailed legacy phase narrative: `CLAUDE.md`

`README.md` is the human quick start. `CLAUDE.md` contains valuable historical
detail but is no longer the orchestration file. When documentation disagrees
with executable source, inspect the source and update the stale document.

## Project in One Minute

Crowbar is a multi-tenant operations platform for bars and restaurants:

- `client/`: Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Radix and
  shadcn/ui.
- `server/`: FastAPI, async SQLAlchemy, PostgreSQL, Redis Streams, WebSockets,
  and Celery.
- `ml/`: internal FastAPI service using pandas, scikit-learn, and LightGBM
  against the main PostgreSQL database.
- `server/db/migrations/`: ordered SQL migrations run by a custom migrator; no
  Alembic.
- `scripts/dev.sh`: starts PostgreSQL, Redis, and ML in Docker, then starts the
  backend and frontend natively. It does not start Celery worker or beat.

Default local ports are frontend `3000`, backend `8000`, ML `8001`,
PostgreSQL `5432`, and Redis `6379`.

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

# Celery, each in a separate terminal
cd server
venv/bin/celery -A app.celery_app worker --loglevel=info --pool=solo
venv/bin/celery -A app.celery_app beat --loglevel=info
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

