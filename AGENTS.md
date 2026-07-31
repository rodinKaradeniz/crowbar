# Crowbar — Current State

This is the repository-wide entry point for contributors and coding agents. It
describes what exists today, where it lives, and how to work safely; detailed
product rules, technical rationale, future work, and day-to-day rules belong to
the documents named below.

## Reading order at the start of every task

1. Read this file for current state, layout, commands, and conventions.
2. Read [docs/RULES.md](docs/RULES.md) for always-on working and verification
   rules.
3. Read [docs/PRODUCT.md](docs/PRODUCT.md) before user-facing work, domain
   fields, copy, or product-rule changes.
4. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before code, data, API,
   security, or infrastructure changes.
5. Read [docs/HISTORY.md](docs/HISTORY.md) before changing established,
   structural, or arbitrary-looking behavior.
6. Read [docs/TODO.md](docs/TODO.md) before planning, sequencing work, or
   touching an adjacent deferred concern.
7. Inspect `git status --short` before editing and preserve unrelated work.

Right-size the reading: a local mechanical change normally needs steps 1–2;
product work needs 1–3; cross-layer or persistence work needs 1–5; planning
needs all six.

For focused work, also read:

- Database or migrations: `server/DATABASE.md`
- ML service or insight models: `ml/CONTEXT.md`
- Deployment: `docs/deployment.md` (verified runbook and partial rollout state;
  deployment remains an explicit user-authorized activity)
- Product UI or visual language: `docs/DESIGN.md`
- Project-specific agent skills: `docs/SKILLS.md`

`README.md` is the human quick start. [docs/README.md](docs/README.md) is the
documentation map. When documentation disagrees with executable source,
inspect the source and update the owning document.

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
- `server/docker-compose.yml` declares the Compose project as `crowbar`; do not
  remove that name or local containers can collide with unrelated repositories
  whose Compose directory is also named `server`.

Default local ports are frontend `3000`, backend `8000`, ML `8001`,
PostgreSQL `5432`, and Redis `6379`.

## Repository layout and documentation ownership

```text
client/              Next.js staff and public-guest application
server/              FastAPI API, SQL migrations, seeds, and pytest suites
ml/                  private FastAPI insight service and ML pipelines
scripts/             local development automation
docs/                durable project knowledge, by owner
```

| Document | Owns |
| --- | --- |
| [`docs/RULES.md`](docs/RULES.md) | Always-on editing, safety, communication, and verification rules |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Product vocabulary, behavior, invariants, scope, and exclusions |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Present technical system shape and request/data flows |
| [`docs/HISTORY.md`](docs/HISTORY.md) | Durable decisions, rationale, and meaningful discovered pitfalls |
| [`docs/TODO.md`](docs/TODO.md) | Deliberately deferred work, known gaps, and delivery order |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Current visual and interaction system |
| [`docs/SKILLS.md`](docs/SKILLS.md) | Project-local workflow-module strategy |

Product rules win when they conflict with convenience refactors. `RULES.md`
wins on working process. `HISTORY.md` explains why an existing behavior exists;
`TODO.md` does not authorize work outside the user’s request.

## Feature snapshot

The operational loop is the confirmed delivery order: authoritative reservation
availability and capacity; floor plan and tables; guest CRM; no-show
protection; purchasing and cost control; then POS and payment integrations.
Availability is complete locally; booking types can retain legacy count-guard
compatibility or use shared cover capacity / atomic table allocation with a
turn buffer. Floor plan/table management has its backend foundation,
responsive Floor host board, manager setup UI, reservation table planning, and
registered-table tab/QR ordering continuity. Guest CRM now has a dedicated
profile, authoritative cross-workflow timeline, queue identity linking,
service-context flags, notes/tags/preferences, public marketing consent
provenance, manager privacy actions, and a one-shot 24-month retention job.
The next product stage is no-show and reservation protection.
[docs/TODO.md](docs/TODO.md) owns every stage boundary and deferred item.

Migrations 023–029 are local only. Railway remains at migrations 001–022; its
partially provisioned rollout is intentionally shelved and must not resume
without explicit user authorization. [docs/deployment.md](docs/deployment.md)
owns the verified resume point.

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

## Canonical conventions

The full technical source of truth is
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In particular, preserve tenant
derivation, module guards, thin router/service/model boundaries, append-only
migrations, commit-before-publish events, the httpOnly JWT/BFF flow, private
ML access, snake_case-to-camelCase mapping, canonical money/day/customer
helpers, milliliter liquid inventory, ledger-backed served reversals, and the
planning-versus-occupancy distinction for tables.

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

## Workflow modules

No project-local workflow module is installed yet. Read
[docs/SKILLS.md](docs/SKILLS.md) before creating one; it requires a repeated,
project-specific workflow rather than a generic checklist and records the
accepted location under `.agents/skills/`.

## Verification status of this document

Last reorganized 2026-07-29 against the repository layout, manifests,
development launcher, architecture, history, and roadmap. This documentation
change ran no application runtime checks.
