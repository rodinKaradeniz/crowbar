---
name: superpowers
description: TDD and verification workflow for Crowbar feature work. Use when implementing features that must work in a supervised pilot, when a debugging session is going in circles, or before claiming any non-trivial task is done. Produces red/green test cycles and evidence-backed completion claims using this repo's real commands.
---

# Superpowers — TDD & Verification Workflow

Principles adapted from Jesse Vincent's Superpowers plugin, made self-contained
and grounded in this repo. Complements `docs/RULES.md` (always applies) — this
skill is the execution workflow; RULES.md is the convention layer.

## The cycle

1. **Define done before starting.** Turn "build X" into "given Y, the system
   returns/renders Z — verified by <specific check>". If done is unclear, ask
   before coding (AGENTS.md "Confirmation Before Development").
2. **Write the failing test first** for backend behavior. Watch it fail for
   the *right reason* — a test that fails on a typo proves nothing. Then make
   it pass with minimum code.
3. **Verify what you shipped, with evidence.** Run the code, not just the
   checks. State exactly what was exercised — "the build passes" and "I drove
   the flow" are different claims (RULES.md "Communication and verification").
4. **Small units.** Break work into steps with their own success criteria;
   complete sequentially rather than splitting into parallel handoffs.

## This repo's verification commands

Use these verbatim. Do not invent alternatives.

```bash
# Frontend (from the repository root)
cd client && npm run lint && npm run test:run && npm run build

# Backend
cd server && venv/bin/python -m pytest

# Apply the migration chain
cd server && venv/bin/python -m db.migrate

# Full local stack
./scripts/dev.sh
```

Two setup preconditions, not optional: backend test dependencies are a separate
manifest (`venv/bin/python -m pip install -r requirements-test.txt` after a venv
rebuild), and `crowbar_test` is created once with
`docker exec crowbar-db createdb -U postgres crowbar_test`.

Never run `python -m db.migrate reset`, delete Docker volumes, or seed a shared
database.

## What `./scripts/dev.sh` actually starts — and what it does not

It starts **PostgreSQL, Redis, and the ML service in Docker**, runs migrations
with demo seeding (`SEED_DATA=true`), then starts **FastAPI (`:8000`) and
Next.js (`:3000`) natively**. Default ports: frontend 3000, backend 8000, ML
8001, PostgreSQL 5432, Redis 6379.

It does **not** run the scheduled jobs. All three are one-shot processes in
`server/app/jobs/`:

- `venv/bin/python -m app.jobs.reservation_reminders` — **mutates data and may
  send email/SMS**
- `venv/bin/python -m app.jobs.customer_retention` — applies the 24-month
  inactivity anonymisation policy
- `venv/bin/python -m app.jobs.inventory_reconciliation` — compares maintained
  balances against the movement ledger

So a change touching reminders, retention, or inventory reconciliation is **not
verified** by running the stack. Either run that job manually and say so, or
report the gap explicitly. Do not describe the flow as end-to-end verified when
only the API process ran.

Also unverified by the stack alone: migration-only constraints. The integration
fixture builds ORM metadata in `crowbar_test` and never applies the SQL chain —
use `./scripts/verify-fresh-db.sh` when the change lives in a migration.

## Debugging discipline

When a fix doesn't take after two attempts, stop patching and localize:
reproduce minimally, state the hypothesis, test the hypothesis directly (logs,
SQL, `curl`), and only then edit. Read `docs/HISTORY.md` first — several
"bugs" here are documented decisions: the rate limiter failing open on Redis
loss, best-effort event publishing after commit, auto-disabled menu items
staying disabled until staff re-enable them, and legacy free-text table labels
being read-only compatibility data.

## When NOT to use

- Throwaway scripts and one-line fixes.
- Doc-only or copy-only changes with no runtime surface.

## Completion checklist

- [ ] The new test failed before the change and passes after
- [ ] Tenant isolation and module-disabled behavior covered where relevant
      (see the `testing` and `guard-crowbar-tenancy` skills)
- [ ] Lint, tests, and build pass on the touched side(s)
- [ ] The actual flow was driven, and the summary says precisely what was and
      was not verified — including any job that did not run
- [ ] `docs/HISTORY.md` records a durable decision; `docs/TODO.md` records newly
      deferred work
- [ ] Deviations from spec named explicitly (RULES.md "Deviations, all
      deliberate")

Optional deeper toolkit: the full plugin at `github.com/obra/superpowers`
(`/plugin marketplace add obra/superpowers-marketplace`).
