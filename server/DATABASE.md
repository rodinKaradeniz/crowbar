# Database Operations

Crowbar uses PostgreSQL and an ordered, filename-tracked SQL migrator rather
than Alembic. Run commands from `server/` with `venv/` activated.

## Safe Commands

| Command | Effect |
| --- | --- |
| `python -m db.migrate` | Apply pending migrations |
| `SEED_DATA=true DEMO_ADMIN_PASSWORD='<one-time value>' python -m db.migrate` | Apply migrations, then replace the synthetic Example Lantern demo tenant |
| `DEMO_ADMIN_PASSWORD='<one-time value>' python -m db.migrate seed` | Replace the synthetic Example Lantern demo tenant without running migrations |
| `docker compose up -d` | Start local PostgreSQL, Redis, and ML |
| `docker compose down` | Stop local containers while keeping volumes |
| `../scripts/verify-fresh-db.sh` | Recreate a name-restricted disposable database, run every migration, repeat the canonical seed, and assert current invariants |

Seeding is a data mutation. The seed deletes and recreates its fixed synthetic
tenant. The runner refuses non-local database hosts and database names that do
not identify disposable development/test data, and it requires a fresh password
of at least 12 characters. Do not delete Docker volumes unless the user
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

`db/seeds/001_seed_puzzles.sql` retains its historical filename for migration
tooling compatibility and is the only seed file. It creates the unmistakably
synthetic Example Lantern tenant with relative reservation dates and data
across all current modules.
Migration 037 and the seed make its DE/EUR/`de-DE`/`Europe/Berlin` region plus
19% beverage/standard, 7% food/reduced, exempt, and custom operational profiles
explicit. Those profiles are editable demo suggestions, not fiscal rules. The
seed also snapshots profile/version and line/order net-tax-gross values on its
historical orders and remains repeat-safe.
Local demo staff identities are:

| Role | Email |
| --- | --- |
| Owner | `owner@example.invalid` |
| Manager | `manager@example.invalid` |
| Staff | `staff@example.invalid` |

The seed stores no password. Supply a one-time local value through
`DEMO_ADMIN_PASSWORD`; the seed runner rejects known reusable demo passwords.
