---
name: testing
description: Writes tests that actually catch bugs. Use when implementing features that need test coverage, or when the user asks to add tests, verify behavior, or check security invariants. Covers unit tests, integration tests, and end-to-end tests with a focus on what breaks in real systems.
---

# Testing

Write tests that catch real bugs, not tests that decorate the codebase.

## Principles

### Test behaviors, not implementations

A test that breaks when you refactor internal structure without changing external behavior is a bad test. Test what the system does, not how it does it.

### Cover the security boundary

For multi-tenant systems, the most important tests aren't happy paths — they're the ones that prove tenant A cannot see tenant B's data. Where isolation is enforced in application code rather than by the database, every route and service that touches tenant-owned data needs a test that drives it as a *second* tenant. There is no database-level backstop to catch a missed predicate, so the test is the only proof.

### Test the failure modes

Every external call fails eventually. Redis becomes unreachable, email and SMS providers reject, databases stall, staff sessions are revoked mid-request. Cover:

- Timeouts
- Rate limits
- Malformed inputs
- Missing required data
- Race conditions between concurrent operations

### Test what you shipped, not what you meant to ship

"I ran typecheck" is not the same as "I verified the flow works." Be specific about what was actually exercised. Static checks (typecheck, lint, build) catch a subset; integration tests catch more; live browser interaction catches the rest.

## When to use each type

**Unit tests:** pure functions, isolated logic, edge cases in specific transformations. Fast, cheap, run often.

**Integration tests:** how modules connect. Database queries with a real DB. API endpoints with real HTTP. External providers mocked, but real orchestration around them.

**End-to-end tests:** critical user flows. Signup, save content, retrieve content. Expensive, run sparingly, but catch what nothing else does.

## Anti-patterns

- **Testing mocks.** If your test only exercises mocked dependencies, it's testing whether your mocks match your mocks.
- **Snapshot tests as the primary coverage.** Snapshot tests capture current output. They don't verify correctness; they lock in whatever's there.
- **100% coverage as the goal.** Coverage is a proxy metric. High coverage of trivial code is worse than 60% coverage of the risky paths.
- **Skipping cross-tenant isolation because "the endpoint filters by business."** That filter is the only control there is. Prove it with a second tenant.
- **Not writing the test that fails without your fix.** If you're fixing a bug, add a regression test that would have caught the original bug.

## In this repo

**Backend** — pytest, split by cost:

```bash
cd server && venv/bin/python -m pytest
```

- `server/tests/unit/` — pure logic and schema behavior: `test_regional_tax.py`,
  `test_rate_limit.py`, `test_booking_schedule_schemas.py`,
  `test_stream_consumer.py`, `test_auth_service.py`,
  `test_reservation_reminders_job.py`, `test_email_service.py`,
  `test_config.py`, `test_insights_router.py`.
- `server/tests/integration/` — PostgreSQL-backed route and service
  coordination. Extend the matching file rather than starting fresh:
  `test_tenant_isolation.py` (cross-business reads and mutations),
  `test_staff_security.py` (roles, invitations, revocation),
  `test_order_authority.py` (server-authoritative pricing, idempotency, tax
  snapshots), `test_inventory_integrity.py`, `test_availability_routes.py` /
  `test_availability_service.py`, `test_reservation_rescheduling.py`,
  `test_reservation_reminder_delivery.py`, `test_floor_plan_routes.py`,
  `test_customer_crm_routes.py`, `test_regional_tax_routes.py`,
  `test_rate_limit_routes.py` / `test_rate_limit_redis.py`.

Two setup facts that bite: test dependencies are a separate manifest
(`venv/bin/python -m pip install -r requirements-test.txt` after a venv
rebuild), and the `crowbar_test` database is created once with
`docker exec crowbar-db createdb -U postgres crowbar_test`.

**Isolation is application-layer, not database-layer.** There is no RLS. A test
that proves isolation drives the real route while authenticated as a *second*
business and asserts 404 — not 403 — for rows the caller may not see. Nothing
below the router will catch a missing business predicate for you.

**Migrations are a separate verification path.** The integration fixture creates
and drops ORM metadata in `crowbar_test`; it does **not** run the migration
chain. A constraint, default, or index that exists only in SQL is unproven
until the fresh-database check runs it:

```bash
cd server && venv/bin/python -m db.migrate     # apply the chain
./scripts/verify-fresh-db.sh                   # full chain + canonical seed, twice, on a disposable DB
```

Never run `python -m db.migrate reset`.

**Frontend** — Vitest with Testing Library and MSW:

```bash
cd client && npm run lint && npm run test:run && npm run build
```

`client/tests/unit/` holds mapper and helper coverage
(`money-and-business-time.test.ts`, `client-api.test.ts`, `availability.test.ts`,
`utils.test.ts`); `client/tests/integration/` holds component behavior
(`reservation-form.test.tsx`, `staff-reservation-dialog.test.tsx`,
`floor-plan-seating-sheet.test.tsx`, `login-form.test.tsx`,
`auth-context.test.tsx`); MSW handlers live in `client/tests/mocks/handlers.ts`.
Run `npm run build` when routing, server/client boundaries, generated docs, or
config may be affected.

**ML** — `ml/tests/` (`test_tenant_isolation.py`, `test_config.py`) with its own
`requirements-test.txt` and `pytest.ini`.

**Known coverage gaps** — `docs/TODO.md` (Testing and Quality) names these, so
do not report them as newly discovered; do close the relevant one when your
change lands nearby:

- frontend coverage for ordering, reservations, module gates, money/time
  mapping, error states, and HTTP↔WebSocket mapper parity
- backend integration coverage for every module, tenant isolation, roles,
  public-endpoint abuse cases, idempotency, legal state transitions, and
  inventory ledger effects
- migration-chain tests against a fresh database alongside ORM-metadata tests
- ML unit, pipeline, minimum-data, reproducibility, and leakage-regression tests
- accessibility, responsive/visual regression, performance budgets, and
  failure-mode tests
- concurrency coverage for capacity claims, seating, and idempotent retries

**What `./scripts/dev.sh` does not verify.** It starts PostgreSQL, Redis, and ML
in Docker plus the backend and frontend natively — but it does **not** run the
scheduled jobs. Anything touching reservation reminders, customer retention, or
inventory reconciliation is unverified until you run that job by hand
(`server/app/jobs/`). Note it rather than implying the flow was exercised.
