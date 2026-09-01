---
name: change-crowbar-schema
description: Workflow for changing Crowbar's persistent data model — next-numbered append-only SQL migrations under the custom migrator, the ORM/Pydantic/frontend-mapper alignment surface a column touches, the design checklist for backfill/constraints/indexes/locks, and the two separate verification paths. Use when adding or altering a table, column, constraint, index, or enum-like value, or when a feature needs a new migration.
---

# Change the Crowbar schema

Crowbar has **no Alembic and no autogeneration**. A schema change is a SQL file
you write by hand, plus every layer above it that you must update by hand. The
recurring failure mode is not a broken migration — it is a correct migration
whose column never reaches the ORM model, the Pydantic schema, the frontend
type, or the mapper, so the feature half-works in a way tests do not catch.

Read `server/DATABASE.md` (safe commands, adding a migration, the demo tenant)
and `docs/RULES.md` § Database Rules first. They are the authority. This skill
is the workflow they do not carry.

## When to use

- Adding or altering a table, column, constraint, index, or foreign key
- Adding a new status/reason/state value that the database validates
- Backfilling or reshaping existing rows
- Any feature whose acceptance requires a new migration

## When NOT to use

- Query-only changes against existing columns
- Money or tax columns **on their own** — read `change-crowbar-money-and-tax`
  for the snapshot and precision rules, then come back here for the migration
- Deployment of a migration; that is user-authorized and paused (see below)

## 1. The migration mechanism

Migrations are ordered `*.sql` files in `server/db/migrations/`, currently
`001_*` through `050_*`. `server/db/migrate.py` sorts them by filename, applies
each unapplied file, and records the filename in the `_migrations` table.

```bash
cd server
venv/bin/python -m db.migrate
```

Rules that follow from that mechanism:

- **Take the next zero-padded number.** Inspect the tail of
  `server/db/migrations/` rather than assuming; a parallel change may have
  taken the number you expected.
- **Append only.** Never edit, reorder, or rename a migration that may have
  been applied anywhere. The tracking table keys on the filename, so a rename
  silently re-runs the file.
- **Write forward SQL against the real current schema**, not against the model
  file. If you are unsure whether a column already exists, read the migration
  that created it.
- There is no down-migration mechanism. Your recovery plan is a *forward*
  migration, and you should know what it would say before you ship the first
  one.

### Two commands that are not safe

- **`python -m db.migrate reset` — do not run it, and do not recommend it.**
  Its hard-coded drop list predates many current tables, so it is destructive
  without being a reliable reset. `docs/TODO.md` carries an open item to repair
  or remove it.
- **`SEED_DATA=true` is a data mutation, not a read.**
  `db/seeds/001_seed_volt_and_vine.sql` deletes and recreates the Volt & Vine
  demo tenant. `./scripts/dev.sh` does **not** seed by default — it gates
  seeding behind `SEED_DATA=true` and otherwise logs that it left demo data
  alone — so seeding is always something you chose. Never point it at shared data.

If your migration changes a table the seed writes, update the seed in the same
change and keep it repeat-safe: `scripts/verify-fresh-db.sh` runs the seed
twice and fails if the second run is not idempotent.

## 2. The alignment surface

A single column change touches this chain. Missing one link is the recurring
defect, so walk it explicitly and name each file you touched in the handoff:

1. **SQL migration** — `server/db/migrations/NNN_*.sql`
2. **ORM model** — `server/app/models/` (e.g. `order.py`, `inventory.py`,
   `reservation.py`). The pytest fixture builds the database from this
   metadata, so a model that disagrees with the SQL produces tests that pass
   against a schema production will never have.
3. **Pydantic schema** — `server/app/schemas/` (`AppBaseModel`, per
   `docs/RULES.md` § Backend Rules). Request and response shapes are separate
   decisions; a column is not automatically exposed.
4. **Frontend raw response type** — `client/lib/api-client.ts`, snake_case,
   mirroring the wire shape exactly.
5. **Frontend domain type** — `client/types/index.ts`, camelCase.
6. **Mapper** — `client/lib/api.ts` (server-side, e.g. `toReservation`,
   `toBusiness`) *and* `client/lib/client-api.ts` (browser). Both exist for
   most entities; updating only one produces a field that appears on one render
   path and is `undefined` on the other.
7. **Mock data** — `client/lib/api-mock.ts` and `client/lib/mock-data.ts`, used
   when `NEXT_PUBLIC_USE_MOCK_API=true`. Mocks that lack the new field mask the
   missing mapper.
8. **Tests** — backend integration coverage plus any frontend test asserting
   the mapped shape.

Conversion happens once, at the frontend boundary; the API stays snake_case.

## 3. Design checklist for the migration itself

Answer each of these before writing the SQL. "Not applicable" is a valid
answer; silence is not.

- **Backfill** — what value do existing rows get? Guess-free defaults beat
  clever inference. Migration 037 gave every existing tenant an `UNSPECIFIED`
  "review required" tax profile rather than inventing a rate; prefer that
  honesty.
- **Nullability** — `NOT NULL` on an existing table needs a default or a
  backfill first. A nullable column that "should" always be set will drift.
- **Defaults** — a server-side `DEFAULT` and the ORM default are different
  things. Set both deliberately, and know which one applies to rows the
  migration itself creates.
- **Check constraints** — encode the rule the service enforces, so a bug in the
  service cannot persist an illegal row (see the `ck_business_country_code`
  style in `037_regional_tax_configuration.sql`).
- **Indexes** — every column a query filters, joins, or orders by, including
  `business_id` on a new tenant-owned table and any column added purely for a
  new filter. A new query without a supporting index is the change, not a
  follow-up.
- **Foreign-key delete behavior** — `ON DELETE CASCADE`, `SET NULL`, or
  `RESTRICT` is a product decision about whether the child row is history or
  detail. Audit and ledger rows generally survive their parent.
- **Recovery strategy** — what forward migration undoes this if it is wrong,
  and is any data unrecoverable once written?
- **Lock duration** — the table may be live during service. Adding a nullable
  column is cheap; a rewrite, a `NOT NULL` scan, or a non-concurrent index
  build on `orders`, `reservations`, or `stock_movements` is not. Prefer
  add-nullable → backfill → constrain over a single blocking statement.
- **Archive, do not delete** — Crowbar's existing tables archive rather than
  drop rows (tax profiles, menu items). Follow that unless there is a reason
  not to.

## 4. Verification — two paths, and they prove different things

Run both. Passing one does **not** prove the other.

**Path A — the migration chain against a fresh database.** This is the only
thing that proves a production database can migrate and that SQL-level
constraints, defaults, and backfills actually work:

```bash
./scripts/verify-fresh-db.sh
```

It creates a disposable `crowbar_verify_*` database, runs every migration with
the seed, repeats the seed to prove idempotency, asserts the applied-migration
count matches the file count, and checks current data invariants. Add an
assertion there when your migration introduces an invariant worth defending.

**Path B — the ORM-metadata test suite.** `server/tests/conftest.py` builds the
schema with `Base.metadata.create_all` against `crowbar_test` and drops it per
test. It never executes the SQL migration chain, so it proves model/service
behavior and proves **nothing** about your migration:

```bash
cd server
venv/bin/python -m pip install -r requirements-test.txt   # separate manifest
venv/bin/python -m pytest
```

Frontend contract work needs its own pass:

```bash
cd client && npm run lint && npm run test:run && npm run build
```

## 5. Add real integration coverage, not a round-trip

An ORM round-trip that saves a row and reads it back proves the model compiles.
Add PostgreSQL-backed integration tests that exercise the thing you actually
changed: a constraint rejecting the illegal row, an illegal state transition
being refused, a uniqueness collision, a cascade doing what you claimed. Extend
the existing file rather than opening a new one —
`server/tests/integration/test_inventory_integrity.py`,
`test_order_authority.py`, `test_regional_tax_routes.py`, and
`test_tenant_isolation.py` are the established homes.

A constraint that lives only in SQL will not exist under the ORM fixture. That
one belongs in `scripts/verify-fresh-db.sh`, not in pytest.

## 6. A migration is not deployed because it applied

Migrations **023–050 are local only**. Railway remains at 001–022 and its
partially provisioned rollout is intentionally paused until the local stages
pass and the user explicitly authorizes deployment. `docs/deployment.md` owns
the verified resume point.

So: never describe a migration as "shipped", "live", or "in production" on the
strength of a local run, and do not run a migration against a deployed database
as part of ordinary feature work.

## Anti-patterns

- Editing an existing migration to "fix" it instead of appending a new one.
- Reusing or skipping a migration number without reading the directory tail.
- Updating the ORM model and stopping, because pytest went green.
- A new filterable column with no index.
- `NOT NULL` added with neither a default nor a backfill.
- Running `db.migrate reset`, or telling someone else to.
- Treating `SEED_DATA=true` as a read-only refresh.
- A new tenant-owned table without `business_id`, its foreign key, and its
  index — see `guard-crowbar-tenancy`.
- Claiming a schema change is verified after only `pytest`.

## Reference

`server/DATABASE.md` (authority on commands, migration procedure, demo
tenant), `docs/RULES.md` (Database Rules, Backend Rules),
`docs/ARCHITECTURE.md` (data flows and layering), `docs/HISTORY.md` (why an
existing column shape exists before you change it), `docs/TODO.md` (the open
`db.migrate reset` repair item). Sibling skills:
`change-crowbar-money-and-tax` for monetary columns, `guard-crowbar-tenancy`
for the tenant predicate, `testing` for coverage selection.
