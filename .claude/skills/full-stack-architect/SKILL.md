---
name: full-stack-architect
description: Applies senior full-stack engineering discipline to feature work spanning frontend, backend, database, and infrastructure. Use when planning, designing, or implementing features that cross multiple layers of the stack — API + UI + schema changes together — or when architectural decisions need to be justified against maintainability, scalability, and cost tradeoffs.
---

# Full-Stack Architect

Approach feature work as a senior engineer would: understand the full flow before writing code, name architectural tradeoffs explicitly, prefer boring solutions over clever ones.

This skill is the cross-stack *workflow* layer; `docs/RULES.md` is the
always-on convention layer and wins on any conflict.

## When to use this skill

- Feature work touching frontend, backend, and database together
- Design decisions about new endpoints, data models, or integration patterns
- Refactors that reshape how layers interact
- When the user asks for "architecture," "design," or "how should we structure this"

## Approach

### Before writing any code

0. **Confirm before implementing.** AGENTS.md's "Confirmation Before
   Development" applies to every cross-layer change: do not convert a missing
   requirement into a silent assumption. Read-only investigation is always
   allowed; edits wait until the outcome, scope, and acceptance criteria are
   clear. When the user proposes a shape (a modal, a sidebar, a background job),
   treat it as a candidate — compare it with credible alternatives, recommend
   one with tradeoffs, and get confirmation. A specific, unambiguous instruction
   already *is* confirmation; do not ask the user to repeat a settled choice.
   Batch the remaining questions.

1. **Understand the full request flow.** Trace what the user does, what the frontend sends, what the backend processes, what the database stores, what comes back. Draw this out mentally or on paper. Missing steps here become bugs later.

2. **Name the constraints.** Multi-tenancy? Auth model? Existing schema conventions? Rate limits? These constrain the solution space. If they're not documented, ask.

3. **Enumerate the tradeoffs.** Almost every meaningful decision has two or three defensible options. Name them:
   - What's simpler now vs harder later
   - What's faster to ship vs cheaper to maintain
   - What matches existing patterns vs what would be better if starting fresh
     State which you're picking and why. Don't silently pick.

4. **Match existing patterns.** If the codebase uses direct SQL, don't introduce an ORM. If tests follow a specific fixture pattern, follow it. New patterns need justification.

### While writing code

1. **Types first.** Define the shape of what flows through the system before implementing the transformations. Frontend types, backend Pydantic models, database schema — all agreeing.

2. **Data model, then API, then UI.** Bottom-up. A wobbly data model makes API design harder, and a wobbly API makes UI harder.

3. **Handle the security boundary explicitly.** Isolation here is enforced in application code, so every query is a place it can be lost. Derive the tenant from the authenticated context and write a test that drives the route as a second business.

4. **Handle failure paths.** What happens when Redis is down? When email or SMS rejects? When the database is unreachable, or the staff session is revoked mid-request? Real systems fail; production code accounts for that.

### After writing code

1. **Test the security invariants.** Not just happy paths — cross-tenant isolation, unauthorized access, malformed inputs.

2. **Verify what you actually claim.** "Typecheck passes" is different from "I clicked through the UI." Be specific.

3. **Document decisions worth remembering.** Non-obvious choices, calibrations, rejected alternatives. Future you (or future engineers) will want to know why.

## In this repo

- **Reading order before designing:** `AGENTS.md` (current state) →
  `docs/RULES.md` → `docs/PRODUCT.md` (what the product may and may not claim)
  → `docs/ARCHITECTURE.md` (present system shape) → `docs/HISTORY.md` (why it's
  built this way — several "obvious improvements" are documented rejected
  alternatives) → `docs/TODO.md` (whether this touches a deferred item).

- **Layering is thin router → service → model.** Routers own transport,
  dependencies, response models, and orchestration
  (`server/app/routers/`). Domain rules live in `server/app/services/`. ORM
  models are `server/app/models/`; Pydantic wire contracts are
  `server/app/schemas/`, all built on `AppBaseModel`. New business logic never
  lands only in a router or a React component.

- **The request flow to trace:** page or component → `client/lib/client-api.ts`
  (public calls use the `/api/backend` rewrite; authenticated calls use the
  `/api/proxy` BFF, which reads the httpOnly `rk-token` cookie and attaches the
  Authorization header) → FastAPI router → `server/app/dependencies.py`
  (`get_current_user`, `get_current_business`, `require_roles`,
  `require_module`) → service → PostgreSQL. Server components may use the typed
  `client/lib/api-client.ts` directly. Isolation is an **application**
  invariant: the business comes from the authenticated context, never from a
  request-supplied id, and a row the caller may not see is a 404.

- **Types first, concretely:** the API speaks snake_case and converts **once**
  at the frontend boundary. Backend Pydantic schema, ORM model, and the
  frontend raw type + camelCase domain type + mapper in `client/lib/api.ts`
  all move together, plus MSW mock data and tests. A field added to only three
  of those five places is the classic bug here.

- **Schema changes** are append-only numbered SQL in
  `server/db/migrations/` (currently through `037_regional_tax_configuration.sql`),
  applied by the custom migrator that sorts filenames and records them in
  `_migrations`:

  ```bash
  cd server && venv/bin/python -m db.migrate
  ```

  Add the next zero-padded file; never edit, rename, or reorder an applied
  migration; never run `db.migrate reset`. There is no Alembic. Read
  `server/DATABASE.md` first. Because integration tests build ORM metadata
  rather than running the chain, verify migrations separately with
  `./scripts/verify-fresh-db.sh`.

- **Async work** is Redis Streams, not a broker and not FastAPI
  BackgroundTasks. `server/app/core/events.py` publishes a `DomainEvent` to the
  `crowbar:events` stream; the in-process consumer
  (`server/app/core/stream_consumer.py`) re-queries authoritative state and
  pushes a projection through a WebSocket manager. **Commit before publish** —
  publishing is best-effort and failure-tolerant, not a transactional outbox,
  so a consumer must never be able to observe uncommitted state. Scheduled work
  is three one-shot jobs in `server/app/jobs/`; `./scripts/dev.sh` does not run
  them.

- **Canonical helpers, not local reimplementations:** money through
  `client/lib/money.ts`, business time through `client/lib/business-time.ts`,
  units through `client/lib/units.ts`, module checks through
  `client/lib/modules.ts`, day handling through `client/lib/days.ts`, and
  customer identity through `server/app/services/customer_identity_service.py`.

- **Domain invariants that constrain design:**
  - Liquid inventory is **milliliters** for both `bottle` and `keg` — never
    special-case one of them.
  - Reversing a served order uses the **order-linked movement ledger**, never
    the current recipe. `inventory_items.current_quantity` is a maintained
    balance updated under a row lock; the ledger is the authority.
  - A table **assignment is planning; a seating is occupancy.** Future
    reservation planning uses the planned interval, not a table's current
    state.
  - Settlement is an audited assertion about an **external** register. Do not
    design tender, cash, tips, refunds, receipts, or fiscal semantics into it.

- **Every staff surface needs a module-disabled state and an empty state**, and
  module entitlement is enforced on both the route and the page.

## Anti-patterns

- **Silently picking one option among several defensible ones.** Name the tradeoff.
- **Building for imagined future requirements.** YAGNI. Solve the current problem, leave hooks for the next one only if they're free.
- **Skipping the failure path because the happy path was easy.** The happy path is the easy 20%.
- **Introducing new dependencies casually.** Every dependency is code you now maintain even though you didn't write it.
- **Rewriting adjacent code because "while I'm here."** Change only what the request requires.

## Communication

When presenting a design:

- Lead with the recommendation, not the analysis
- State the tradeoff you're navigating
- Say what you're leaving out and why
- Flag anything you're uncertain about, don't paper over it
- Push back if the request has a flaw — "this won't work because X, here's an alternative"
