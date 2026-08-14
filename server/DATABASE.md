# Database Operations

Crowbar uses PostgreSQL and an ordered, filename-tracked SQL migrator rather
than Alembic. Run commands from `server/` with `venv/` activated.

## Safe Commands

| Command | Effect |
| --- | --- |
| `python -m db.migrate` | Apply pending migrations |
| `SEED_DATA=true python -m db.migrate` | Apply migrations, then replace the Puzzles demo tenant |
| `python -m db.migrate seed` | Replace the Puzzles demo tenant without running migrations |
| `docker compose up -d` | Start local PostgreSQL, Redis, and ML |
| `docker compose down` | Stop local containers while keeping volumes |
| `../scripts/verify-fresh-db.sh` | Recreate a name-restricted disposable database, run every migration, repeat the canonical seed, and assert stage-1 invariants |

Seeding is a data mutation. The seed deletes and recreates its fixed Puzzles
tenant and must not be run against shared or production data without explicit
authorization.

Do not use `python -m db.migrate reset`. Its hard-coded drop list predates the
current schema, so it is destructive without being a reliable full reset. Do
not delete Docker volumes unless the user explicitly authorizes losing the
selected local data.

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

`db/seeds/001_seed_puzzles.sql` is the only seed file. It creates the Puzzles
tenant with relative reservation dates and data across all current modules.
Local demo staff accounts are:

| Role | Email |
| --- | --- |
| Owner | `jamie@puzzlesbar.com` |
| Manager | `sam@puzzlesbar.com` |
| Staff | `alex@puzzlesbar.com` |

The seed file documents the local-only demo password. Never reuse seed
credentials in a deployed environment.
