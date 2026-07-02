# Database Operations

All commands run from `server/` with the virtual environment activated.

## Commands

| Command | Description |
|---|---|
| `python -m db.migrate` | Run pending migrations (production-safe, idempotent) |
| `SEED_DATA=true python -m db.migrate` | Run migrations + seed test data |
| `python -m db.migrate seed` | Seed only (tables must exist) |
| `SEED_DATA=true python -m db.migrate reset` | Drop all → migrate → seed (full reset) |
| `python -m db.migrate reset` | Drop all → migrate (no seed data) |

## Infrastructure

| Command | Description |
|---|---|
| `docker compose up -d` | Start PostgreSQL + Redis |
| `docker compose down` | Stop containers (keeps data) |
| `docker compose down -v` | Stop + delete all data volumes (full nuke) |

## Full Environment Reset

```bash
# 1. Nuke Docker volumes (deletes all DB data)
docker compose down -v

# 2. Restart containers
docker compose up -d

# 3. Wait a few seconds for PostgreSQL to be ready, then:
SEED_DATA=true python -m db.migrate reset
```

## Test Accounts (after seeding)

Password for all accounts: `password123`

### Staff
| Email | Name | Business |
|---|---|---|
| owner@rustictable.com | Maria Rodriguez | The Rustic Table |
| manager@rustictable.com | James Wilson | The Rustic Table |
| staff@rustictable.com | Emily Chen | The Rustic Table |
| owner@grandhall.com | Robert Thompson | Grand Event Hall |
| manager@grandhall.com | Lisa Anderson | Grand Event Hall |
| consultant@strategic.com | Dr. Michael Park | Strategic Consulting |
| therapist@wellness.com | Dr. Sarah Johnson | Wellness Therapy Center |

### Customers
| Email | Name |
|---|---|
| john.doe@example.com | John Doe |
| jane.smith@example.com | Jane Smith |
| mike.johnson@example.com | Mike Johnson |
| sarah.williams@example.com | Sarah Williams |
| david.brown@example.com | David Brown |

## Custom Form Fields

Service types support customizable reservation forms via the `form_fields` JSONB column. When `form_fields` is `null`, the default reservation form is used.

### `service_types.form_fields` (JSONB, nullable)

An ordered array of field definitions:
```json
[
  { "id": "sys_date", "label": "Date", "type": "date", "required": true, "order": 0, "system": true },
  { "id": "sys_time", "label": "Time", "type": "time", "required": true, "order": 1, "system": true },
  { "id": "f_custom1", "label": "Dietary Restrictions", "type": "select", "required": false, "options": ["None", "Vegetarian", "Vegan", "Gluten-free"], "order": 6, "system": false }
]
```

**Field types:** `text`, `textarea`, `number`, `email`, `phone`, `date`, `time`, `select`, `checkbox`

**System fields** (`system: true`) map to real reservation columns (date, time, guests, email, phone, name). Custom fields are stored in `reservations.custom_fields`.

### `reservations.custom_fields` (JSONB, nullable)

Stores submitted custom field values keyed by field ID:
```json
{ "f_custom1": "Vegetarian", "f_custom2": "Please seat near the window" }
```

## Test Database

Integration tests use a separate `crowbar_test` database to avoid touching development data.

| Command | Description |
|---|---|
| `docker compose exec postgres createdb -U postgres crowbar_test` | Create the test database (one-time setup) |
| `docker compose exec postgres dropdb -U postgres crowbar_test` | Drop the test database |

The test suite automatically creates and drops all tables before/after each test — no manual migrations needed. The test database URL is derived from your main `DATABASE_URL` by replacing the path segment `/crowbar` with `/crowbar_test` (see `tests/conftest.py`).

## Adding a New Migration

1. Create a new file in `server/db/migrations/` with the next sequence number:
   ```
   server/db/migrations/002_add_some_feature.sql
   ```
2. Write your DDL (CREATE TABLE, ALTER TABLE, etc.)
3. Run `python -m db.migrate`
4. The `_migrations` table tracks which files have been applied — already-applied migrations are skipped automatically.

## Seed Data Notes

- Seed files use `IF NOT EXISTS` guards to prevent duplicate inserts.
- Reservation dates are **relative to the current date** (using `NOW()` offsets), so you always see upcoming reservations regardless of when you seed.
- Business, user, staff, and service type `created_at` timestamps are static (historical dates that don't affect the UI).
