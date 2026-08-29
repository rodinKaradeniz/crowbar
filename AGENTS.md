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
- MVP implementation or release verification: `docs/MVP_ACCEPTANCE.md`
  (surface dispositions, risk register, and stage 1–8 evidence contract)
- Product UI or visual language: `docs/DESIGN.md`
- Project-specific agent skills: `docs/SKILLS.md`

`README.md` is the human quick start. This file is the only document ownership
map and reading order. When documentation disagrees with executable source,
inspect the source and update the owning document.

`docs/RULES.md` owns the confirmation gate, scope discipline, and verification
rules. Read it rather than looking for a second copy here.

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
- `scripts/dev.sh`: starts PostgreSQL, Redis, and ML in Docker, applies pending
  migrations, then starts the backend and frontend natively. It does not run
  scheduled jobs and does not seed demo data unless invoked with
  `SEED_DATA=true`, which is a data mutation — see
  [server/DATABASE.md](server/DATABASE.md).
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
| [`docs/MVP_ACCEPTANCE.md`](docs/MVP_ACCEPTANCE.md) | MVP route inventory, authority trace, risk register, and stage 1–8 acceptance evidence |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Current visual and interaction system |
| [`docs/SKILLS.md`](docs/SKILLS.md) | Project-local workflow-module strategy |

Product rules win when they conflict with convenience refactors. `RULES.md`
wins on working process. `HISTORY.md` explains why an existing behavior exists;
`TODO.md` does not authorize work outside the user’s request.

## Feature snapshot

Crowbar's first release target is a supervised pilot at a single-location bar
in Germany. The MVP owns the non-fiscal operational loop: venue/staff setup;
reservations and protection; future waitlist and current queue; areas, tables,
assignments, and seatings; menu, QR/staff orders, fulfillment, and tabs;
external settlement recording; stock, purchasing, cost control; guest CRM; and
operational reporting. The venue's separate compliant register remains payment
and fiscal authority. Crowbar does not take payment or issue receipts/invoices
in this MVP, and product/code copy must say **settled externally** rather than
implying payment processing.

Stages 0–4 are complete locally: the contract and release map are frozen;
tenant/auth/order/inventory/reservation/CRM/time correctness is repaired;
retained routes have consistent guards; dead MVP states are removed; and the
full Stage 1 verification gate passes. Tenant country/currency/formatting
locale/IANA timezone/phone parsing and editable operational tax profiles now
drive public and staff presentation; placed order lines retain immutable
currency/profile/rate/net/tax/total snapshots. Germany is seeded as an
editable pilot preset, not hard-coded fiscal law. Availability, the area-based
host board, table planning/seating, registered-table tab/QR continuity,
reservation protection, and the future-reservation waitlist remain the
operational foundation. The guest-to-table and ordering/external-settlement
loops are complete and hardened with exchanged capability cookies, staff-
approved per-browser table sessions, exact public projections, authenticated
WebSocket frames, hashed bearer persistence, and composite tenant constraints.

Stage 5 (stock, purchasing, cost control) is complete locally through migration
048. Suppliers, supplier products, purchase orders, partial receiving, pack
conversions, count sessions with CSV round-trip, purchase-price history,
attachments, and cost control run on one movement ledger with a staff UI and
PostgreSQL-backed tests. Location transfers were deliberately cut and are
deferred with a trigger; migrations 046/047 stay dormant.

Stage 6 (staff permissions, CRM, operational reporting) is complete locally
through migration 049. Authorization is a fixed five-role capability matrix in
`server/app/core/permissions.py` — `owner`, `manager`, `host_server`,
`bar_kitchen`, `inventory_operator` — asked for as
`require_capability("...")` rather than by naming roles, mirrored to
`client/lib/permissions.ts` and recorded route-by-route in
[docs/permission-matrix.md](docs/permission-matrix.md). It is hard-coded, not
tenant-editable; a tenant-configurable RBAC module is a deferred evaluation.
Guests raise their own access, correction, deletion and consent-withdrawal
requests through the reservation link they already hold, and withdrawal now
actually suppresses marketing at the send boundary while leaving operational
messages alone. `/business/reports` and `/api/reports/*` cover bookings and
no-shows, queue wait and seating conversion, table utilization and turn time,
station throughput and ticket timing, the three separate ordered / open-tab /
externally-settled value figures, stock and waste, purchasing spend and staff
actions — each over a chosen range with CSV export, and none of them a fiscal
or accounting report. Insights survives an ML restart by serving its last
result marked stale.

Stage 7, the interface redesign pass, is **ported**. The design direction is
closed: [docs/DESIGN.md](docs/DESIGN.md) is the committed contract, taken from
the locked rev-3 deliverable, and it owns the token layer, the three-tier
severity rank and its qualification test, the primitive set, the six mandatory
states, and the two fixed grounds.

Four things that will bite if you do not know them:

- **Rule zero.** No colour, size, spacing value, radius or duration enters that
  the `:root` block in `client/app/globals.css` does not declare. The raw-hex
  grep in DESIGN.md is the check, and it names the only four categories of hit
  that are allowed to survive.
- **Severity is a procedure, not a judgement.** `client/lib/severity.ts` owns
  it. Do not classify a severity inside a component, and do not reach for red
  because something looks bad — the rank's whole job is to stop that.
- **Grounds are fixed by surface**, not chosen. The dark-mode toggle is gone.
- **Two targets only**: desktop 1280+ and tablet 1024×768. There is no phone
  design; stage 7's phone exit gate is recorded as **unmet**.

Backend gaps the design assumes, and the open design questions it raised, are in
[docs/TODO.md](docs/TODO.md) §7a and §7b. Several are load-bearing: three of the
four critical cases in the rank are not derivable yet, so critical legitimately
appears on very few surfaces.

After stage 7 come the local release gate (8), deployment (9), the supervised
pilot (10), and a mobile client (11).
[docs/TODO.md](docs/TODO.md) owns the exact 0–11 order, exit gates, and
post-MVP deferrals.

Migrations 023–049 are local only. Railway remains at migrations 001–022; its
partially provisioned rollout is intentionally paused until stages 0–8 pass
locally and the user explicitly authorizes deployment. The user plans to use
Railway, but that intent is not authorization to mutate it.
[docs/deployment.md](docs/deployment.md) owns the verified resume point.

## Commands

```bash
# Full development stack from the repository root (migrates, does not seed)
./scripts/dev.sh

# Same, plus replace the synthetic demo tenant (data mutation)
SEED_DATA=true ./scripts/dev.sh

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

Do not run `SEED_DATA=true` seeding (it deletes and re-creates the demo
tenant), delete Docker volumes, or seed shared databases unless the user
explicitly requests it. Repository state belongs to the user;
[docs/RULES.md](docs/RULES.md) owns the Git restriction.

## Canonical conventions

The full technical source of truth is
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In particular, preserve tenant
derivation, module guards, thin router/service/model boundaries, append-only
migrations, commit-before-publish events, the httpOnly JWT/BFF flow, private
ML access, snake_case-to-camelCase mapping, canonical money/day/customer
helpers, milliliter liquid inventory, ledger-backed served reversals, and the
planning-versus-occupancy distinction for tables. Preserve the MVP boundary:
tax profiles are tenant-configured operational estimates, and tab settlement
is an audited assertion about the external register—not a payment/fiscal path.

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

Project-local workflow modules are installed under `.claude/skills/`. Ten are
Crowbar-specific — `run-crowbar-service-loop`, `guard-crowbar-tenancy`,
`change-crowbar-money-and-tax`, `change-crowbar-schema`,
`write-crowbar-operational-copy`, `security`, `testing`, `superpowers`,
`frontend-design`, and `full-stack-architect` — and three are generic craft
skills. They load on a matching task; they add process
and cannot weaken [docs/RULES.md](docs/RULES.md) or
[docs/PRODUCT.md](docs/PRODUCT.md).

User-level skills under `~/.claude/skills/` are in scope for this repository's
work and compose with the project set — most usefully on design work, where
they supply direction and craft while `frontend-design` supplies the Crowbar
constraint. Like project skills they add process and cannot weaken
[docs/RULES.md](docs/RULES.md) or [docs/PRODUCT.md](docs/PRODUCT.md).

[docs/SKILLS.md](docs/SKILLS.md) owns the strategy: the accepted location, the
installed set and its division of labor, the skills planned but not yet
written, and the quality bar for adding one. Read it before creating or
editing a skill.

## Verification status of this document

Last reconciled 2026-08-26 against the completed stage 6: the migration set
through 049, the capability matrix and every route's guard, the reports and
public-privacy routers and services, the staff UI under
`client/app/business/reports/`, and a live role-by-role HTTP walk plus a
by-hand reconciliation of each report against its ledger on a disposable
seeded database. Earlier reconciliations: 2026-08-25 against the completed
stage 5 and its order → receive → count → reconcile → cost journey, 2026-08-25 against the documentation
consolidation and the 0–11 stage sequence, 2026-08-18 against the installed
`.claude/skills/` set, and 2026-08-14 against the supervised-pilot boundary and
stage-0 acceptance map.
