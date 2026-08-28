# Crowbar Working Rules

This file owns day-to-day process: how to decide, how to edit, how to verify,
and how to report. It is the procedural authority — a workflow module, whether
installed under `.claude/skills/` in this repository or at the user level, may
add process but cannot weaken it.

It deliberately does **not** restate the reading order or the document
ownership map; [`../AGENTS.md`](../AGENTS.md) owns both. It does not restate
product invariants; [`PRODUCT.md`](PRODUCT.md) owns those and wins on product
conflicts. When a rule below and an owning document disagree, the owning
document is right and this file is stale — fix it.

## Scope discipline

Crowbar is a supervised single-venue MVP, not a platform. Correct, simple, and
finished beats general, configurable, and half-built.

- Build what was asked. Do not widen scope, generalize a solution, or add
  configuration, abstraction, or a second code path that no current caller
  needs.
- Prefer the smallest coherent change that solves the requested problem, and
  follow an existing abstraction before adding a parallel one.
- Extract a shared primitive on the third real use, not the first anticipated
  one. Fixing an existing shared primitive still beats repeating call-site
  patches.
- Do not add a dependency, a background job, a cache, a queue, a new service,
  or a new document without a named need. Say why the simpler option fails.
- Do not add speculative rules, `HISTORY.md` entries, `TODO.md` items, or
  skills as if they were agreed requirements.
- Finish the requested scope completely. If part of it is blocked, deliver the
  rest and say exactly what was left and why; narrowing scope is the user's
  call, not yours.

## Before you start

- Do not begin implementation until the requested outcome, scope, and
  meaningful acceptance criteria are clear.
- A specific, unambiguous instruction is already confirmation. Do not ask the
  user to restate a settled choice.
- Ask only when two credible readings would produce materially different work
  in product behavior, UX, architecture, data, security, or effort. Batch the
  questions and include a recommendation. Otherwise state the assumption and
  proceed.
- When the user proposes a solution shape and the choice is genuinely open,
  name one better-fitting alternative with its tradeoff and get confirmation.
  One alternative, not a survey — and none at all when the proposal is already
  a reasonable fit.
- Read-only inspection, tracing, and evidence gathering may happen before
  confirmation. Code edits, schema changes, dependency changes, generated
  artifacts, and external mutations wait.

## Editing

- Inspect the current worktree before editing. Treat existing modifications and
  untracked files as user work.
- Trace the full path of a behavior before changing it: UI or caller, frontend
  mapper, route, schema, service, model, migration, event, and tests as
  applicable.
- Put domain rules in services; keep routers and pages focused on
  orchestration.
- Derive tenant scope from authenticated context and verify requested resource
  ownership inside that scope. Apply module guards on both backend routes and
  staff pages for subscribable features.
- Make public mutations safe under retries when the operation supports an
  idempotency or session token.
- Commit database state before publishing an event that causes a projection.
- Add a new migration for every schema change and keep ORM, schemas, and types
  aligned.
- Name migrations, modules, and symbols after the functionality they carry,
  never after the roadmap stage that introduced them. A stage number is
  scheduling metadata that stops being true, while the functionality it
  shipped keeps the same name for as long as the code lives.
- Preserve error response shape, meaningful HTTP status codes, and API
  snake_case; convert once at the frontend boundary.
- Reuse canonical helpers for money, cart pricing, units, days, modules, and
  customer identity.
- Test the highest-risk behavior, not just the happy path. Include tenant
  isolation and module-disabled behavior where relevant.
- Wrap a genuinely swappable external provider behind the existing local
  service boundary; do not leak provider contracts into product callers.

## Do not

- Do not discard, rewrite, or reformat unrelated worktree changes.
- Do not mutate repository state. Never stage, commit, branch, check out,
  stash, restore, reset, or rewrite history — the user owns that step, so do
  not perform it, offer it, or treat unstaged files as a problem to solve.
  Read-only `git status`, `git diff`, and `git log` are always allowed.
- Do not run database reset, shared seeding, volume deletion, deployment, or
  external writes without explicit authorization. Treat `SEED_DATA=true` as
  demo-data mutation, not a harmless read.
- Do not edit, reorder, or rename an applied SQL migration.
- Do not leave behind files or folders that existed only to serve one
  session. Scratch output, audit captures, handoff notes, and generated
  reports are deleted by the work that created them once they have been
  read.
- Do not present inferred requirements as confirmed requirements.
- Do not trust `business_id`, `user_id`, price, discount, age, status, or
  inventory effects supplied by a browser when the server can derive them.
- Do not query tenant-owned data without a business predicate.
- Do not put new business logic only in a React component or router.
- Do not denormalize a total or estimate without a measured need and an
  explicit consistency design.

## Frontend

- Prefer Server Components for initial authenticated data fetching; use client
  components for interactive state.
- Browser public calls use the `/api/backend` rewrite. Browser authenticated
  calls use `/api/proxy`. Server-side calls may use the low-level typed client.
  Add new public route prefixes to `client/middleware.ts` deliberately.
- Mirror new backend fields in raw response types, camelCase domain types,
  mappers, browser/server call paths, mock data where applicable, and tests.
- Use existing Radix/shadcn components and the `DESIGN.md` tokens before
  creating new primitives or one-off color systems.
- Preserve accessibility: semantic controls, labels, focus behavior, keyboard
  operation, reduced-motion behavior, and legible contrast.
- Run at least targeted Vitest tests and ESLint for functional frontend work;
  run `npm run build` when routing, server/client boundaries, generated docs,
  config, or production compilation may be affected.

## Backend

- Use `AppBaseModel` for new Pydantic schemas.
- Use `get_current_user`, `get_current_business`, `require_capability`, and
  `require_module` rather than custom auth checks where they apply. Services
  accept authoritative tenant IDs from dependencies, not request data.
- Every authenticated route names a capability from `app/core/permissions.py`.
  Do not check a role directly, and do not add a capability without adding it to
  the roles that hold it. After changing a guard or the matrix, regenerate
  `docs/permission-matrix.md` and `client/lib/permissions.ts` with the scripts
  under `server/scripts/`.
- Explicitly commit before `publish()`; publishing is failure-tolerant and is
  not a transactional outbox.
- Preserve idempotency and legal transition rules in services.
- Add PostgreSQL-backed integration tests for auth, tenancy, constraints, and
  route/service coordination.
- Install `requirements-test.txt` after a venv rebuild; runtime requirements do
  not include pytest.
- There is no established backend formatter, linter, or type checker yet. Match
  surrounding style and do not introduce a new quality tool incidentally.

## Database

- Read `server/DATABASE.md` before migration work.
- Use a new, next-numbered SQL file that is safe for the actual current schema.
- Consider backfill, nullability, defaults, checks, indexes, foreign-key delete
  behavior, recovery strategy, and lock duration.
- Validate both the migration path and the ORM-metadata test path when
  practical.

## ML

Read `ml/CONTEXT.md` before model or pipeline work; it owns the pipeline rules,
evaluation discipline, and data-sufficiency reporting. Two constraints hold
outside that file: the ML service keeps database access read-only except for
its own output tables, and the frontend must stay usable when ML is
unavailable.

## Documentation

- Update the document that owns a changed fact; do not restate it elsewhere.
- Use present tense in `ARCHITECTURE.md`.
- Keep product positioning, vocabulary, user-visible behavior, and deliberate
  exclusions in `PRODUCT.md`, not in technical documents.
- Append dated entries to `HISTORY.md` only for durable decisions or reusable
  pitfalls; include context, decision, consequences, and references.
- Keep only active or intentionally deferred work in `TODO.md`; explain the
  dependency or trigger for non-trivial work and mark completed items promptly.
- Avoid volatile counts, "all tests pass" claims, and dependency versions in
  prose when a manifest is the better source.
- Correct stale documentation in the same change when it would mislead the next
  agent. Routine code changes need no documentation churn.

## Communication and verification

- Lead with the outcome, then the evidence.
- Name exact commands, checks, routes, or flows that ran, what passed, and what
  was only inspected. Never imply verification that did not occur.
- Report in-scope work that was blocked, deferred, or not done, and any
  non-trivial departure from the requested approach.
