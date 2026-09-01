# Database Operations

Crowbar uses PostgreSQL and an ordered, filename-tracked SQL migrator rather
than Alembic. Run commands from `server/` with `venv/` activated.

## Safe Commands

| Command | Effect |
| --- | --- |
| `python -m db.migrate` | Apply pending migrations |
| `SEED_DATA=true DEMO_ADMIN_PASSWORD='<one-time value>' python -m db.migrate` | Apply migrations, then replace the synthetic Volt & Vine demo tenant |
| `DEMO_ADMIN_PASSWORD='<one-time value>' python -m db.migrate seed` | Replace the synthetic Volt & Vine demo tenant without running migrations |
| `docker compose up -d` | Start local PostgreSQL, Redis, and ML |
| `docker compose down` | Stop local containers while keeping volumes |
| `../scripts/verify-fresh-db.sh` | Recreate a name-restricted disposable database, run every migration, repeat the canonical seed, and assert current invariants |

`../scripts/dev.sh` applies migrations without seeding. Pass `SEED_DATA=true`
to it to seed as well; it forwards whatever `DEMO_ADMIN_PASSWORD` is already in
the environment and does not invent one.

Seeding is a data mutation. The seed deletes and recreates its fixed synthetic
tenant. What keeps it away from anything real is a single guard: the runner
refuses any database host that is not local. `DEMO_ADMIN_PASSWORD` is optional,
and when it is unset the runner falls back to a known weak password and prints
it once seeding finishes — it is a local-only convenience, not a secret, which
is why no seed file may contain it. Do not delete Docker volumes unless the user
explicitly authorizes losing the selected local data.

## Test Database

Integration tests use the separate `crowbar_test` database. The test
configuration derives its URL by replacing the main database name with
`crowbar_test`.

```bash
# One-time setup while the local PostgreSQL container is running
docker compose exec postgres createdb -U postgres crowbar_test

# Install the separate test dependency manifest, then run the suite
venv/bin/python -m pip install -r requirements-test.txt
venv/bin/python -m pytest
```

The pytest fixture creates and drops ORM metadata for each test. It does not
execute the SQL migration chain, so passing integration tests do not prove that
a fresh production database can migrate successfully.

## Adding a Migration

1. Inspect the current migration tail and choose the next zero-padded filename
   in `db/migrations/`.
2. Write forward SQL for the actual deployed schema. Include backfill,
   nullability, defaults, constraints, indexes, foreign-key behavior, and lock
   duration as applicable.
3. Update SQLAlchemy models, Pydantic schemas, frontend wire/domain contracts,
   mappers, mock data, and tests in the same coherent change.
4. Run `python -m db.migrate` against a disposable database and separately run
   the ORM-backed test suite.
5. Never edit, reorder, or rename a migration that may have been applied.

The migrator sorts `*.sql` files and records each applied filename in
`_migrations`.

## Historical Filename Compatibility

Migrations 005 and 006 were renamed early in the project. Only when restoring a
backup whose `_migrations` table contains the former names, verify that state
and update the tracking rows before running the current migration files:

```sql
UPDATE _migrations
SET filename = '005_locations_and_module_flags.sql'
WHERE filename = '005_phase0_foundation.sql';

UPDATE _migrations
SET filename = '006_onboarding_notifications_calendar.sql'
WHERE filename = '006_phase1.sql';
```

This is a recovery compatibility step, not permission to rename current
migrations.

## Canonical Demo Tenant

`db/seeds/001_seed_volt_and_vine.sql` is the only seed file, named for what it
carries. Seeds are discovered by globbing `seeds/*.sql` and are not tracked by
filename the way migrations are, so renaming one is safe. It creates the
unmistakably synthetic Volt & Vine tenant with relative dates and data across
all current modules: one primary location, three areas, twenty tables, two active
combinations, the Bar and Kitchen preparation stations, table assignments for the
days ahead, a live queue and waitlist, an open seating carrying an open tab, and a
closed seating whose tab was settled externally with its settlement event.
Migration 037 and the seed make its DE/EUR/`de-DE`/`Europe/Berlin` region plus
19% beverage/standard, 7% food/reduced, exempt, and custom operational profiles
explicit. Those profiles are editable demo suggestions, not fiscal rules. The
seed also snapshots profile/version and line/order net-tax-gross values on its
historical orders and remains repeat-safe.
Local demo staff identities are:

| Role | Email |
| --- | --- |
| Owner | `owner@example.com` |
| Manager | `manager@example.com` |
| Host / server | `host@example.com` |
| Bar / kitchen | `bar@example.com` |
| Inventory operator | `inventory@example.com` |

One account per role, so the permission matrix in
[`../docs/permission-matrix.md`](../docs/permission-matrix.md) can be checked by
signing in rather than by reading a table.

The seed stores no password and cannot: the runner substitutes a bcrypt hash for
a placeholder at run time, and `scripts/export-portfolio.sh` fails the export if a
plaintext one ever reaches a seed file. Set `DEMO_ADMIN_PASSWORD` to choose the
password that hash covers. It is optional — unset, the runner uses a known weak
local-only one and prints it after seeding.
