# Crowbar Working Rules

These rules apply on every task. They are the procedural authority: a local
workflow module may add process but cannot weaken them.

## Reading order and document authority

1. Read [`../AGENTS.md`](../AGENTS.md) and this file on every task.
2. Read [`PRODUCT.md`](PRODUCT.md) before user-facing work, domain fields,
   copy, or product changes.
3. Read [`ARCHITECTURE.md`](ARCHITECTURE.md) before code, data, API, security,
   or infrastructure changes.
4. Read [`HISTORY.md`](HISTORY.md) before changing established or
   arbitrary-looking behavior.
5. Read [`TODO.md`](TODO.md) before planning or touching related deferred work.

Read [`MVP_ACCEPTANCE.md`](MVP_ACCEPTANCE.md) before implementing or verifying
supervised-MVP stages 1–7. Close or update its existing route, risk, and
acceptance rows instead of maintaining a separate release checklist.

`PRODUCT.md` owns product behavior and wins on product conflicts.
`ARCHITECTURE.md` owns present system shape; `HISTORY.md` owns rationale;
`TODO.md` owns deliberate future work. This file owns day-to-day process and
verification. Read [`../AGENTS.md`](../AGENTS.md) for the right-sized version
of this order and specialized references.

## Confirmation Gate

- Do not begin implementation until the requested outcome, affected users,
  scope, constraints, and meaningful acceptance criteria are clear.
- Do not convert an unknown into a silent assumption. Ask the user whenever the
  answer could materially change product behavior, UX, architecture, data,
  security, delivery, or effort.
- If the user suggests one possible solution, treat it as a candidate unless
  they explicitly require it. Consider patterns used by strong modern
  applications, propose better-fitting alternatives, explain tradeoffs, and
  obtain confirmation before implementing a direction.
- Challenge the solution shape constructively, not the user's goal. Examples:
  modal versus sheet or dedicated page; sidebar versus dropdown or command
  menu; polling versus push; synchronous work versus a background job; custom
  code versus an existing project abstraction.
- Read-only inspection, tracing, and evidence gathering may happen before the
  confirmation. Code edits, schema changes, dependency changes, generated
  artifacts, and external mutations must wait.
- A specific, unambiguous instruction is already confirmation. Do not create
  ceremony by asking the user to repeat a settled choice.
- Combine related clarification questions and include a recommendation when
  enough evidence exists. If an answer will not affect the implementation, do
  not ask it.

## Do

- Start by reading `AGENTS.md`, this file, and the task-relevant context.
- Inspect the current worktree before editing. Treat existing modifications and
  untracked files as user work unless proven otherwise.
- Trace the full path of a behavior before changing it: UI or caller, frontend
  mapper, route, schema, service, model, migration, event, and tests as
  applicable.
- Prefer the smallest coherent change that solves the requested problem.
- Follow existing abstractions before adding a parallel one.
- Fix a shared primitive rather than accumulating equivalent call-site patches.
- Put domain rules in services and keep routers/pages focused on orchestration.
- Derive tenant scope from authenticated context and verify requested resource
  ownership inside that scope.
- Apply module guards on both backend routes and staff pages for subscribable
  features.
- Make public mutations safe under retries when the operation supports an
  idempotency or session token.
- Commit database state before publishing an event that causes a projection.
- Add a new migration for every schema change and keep ORM/schema/types aligned.
- Preserve error response shape and meaningful HTTP status codes.
- Preserve API snake_case; convert once at the frontend boundary.
- Reuse canonical helpers for money, cart pricing, units, days, modules, and
  customer identity.
- Test the highest-risk behavior, not just the happy path. Include tenant
  isolation and module-disabled behavior where relevant.
- Report commands that were run and checks that were not possible.
- Record durable decisions in `docs/HISTORY.md` and future work in
  `docs/TODO.md`.
- Wrap a genuinely swappable external provider behind the existing local
  service boundary; do not leak provider contracts into product callers.

## Do Not

- Do not discard, rewrite, or reformat unrelated worktree changes.
- Do not mutate repository state. The agent never stages, commits, branches,
  checks out, stashes, restores, resets, or rewrites history — the user owns
  that step and performs it separately, so do not perform it, offer it, or
  treat unstaged or untracked files as a problem to solve. Read-only inspection
  (`git status`, `git diff`, `git log`) is always allowed.
- Do not present inferred requirements as confirmed requirements.
- Do not implement a proposed UI or architecture pattern before considering
  relevant alternatives and receiving confirmation when the choice is open.
- Do not trust `business_id`, `user_id`, price, discount, age, status, or
  inventory effects supplied by a browser when the server can derive them.
- Do not query tenant-owned data without a business predicate.
- Do not put new business logic only in a React component or router.
- Do not expose the JWT to browser JavaScript or move it out of the httpOnly
  cookie flow.
- Do not duplicate public-order pricing rules in the tab compose flow.
- Do not special-case bottle and keg inventory math; both are ml-based.
- Do not reverse inventory from the current recipe. Use the order-linked
  movement ledger.
- Do not auto-enable a menu item after stock recovery; staff may have disabled
  it intentionally.
- Do not denormalize a total or estimate without a measured need and an explicit
  consistency design.
- Do not edit, reorder, or rename an applied SQL migration.
- Do not run database reset, shared seeding, volume deletion, deployment, or
  external writes without explicit authorization. Git is covered above: it is
  never authorized by a task.
- Do not claim that `docs/deployment.md` is implemented.
- Do not describe Crowbar MVP as a German cash register, payment processor,
  fiscal record, receipt system, or tax authority. “Settled externally” means
  the venue's separate compliant register remains authoritative.
- Do not implement an item from `docs/backlog.md` without reconciling it against
  source and `docs/TODO.md`; the backlog is a legacy ledger.
- Do not add speculative rules, history, or TODO items as if they were agreed
  requirements.
- Do not add a skill for generic knowledge the agent already has. Skills should
  encode a repeated, project-specific, or fragile workflow.

## Frontend Rules

- Prefer Server Components for initial authenticated data fetching; use client
  components for interactive state.
- Browser public calls use the `/api/backend` rewrite. Browser authenticated
  calls use `/api/proxy`. Server-side calls may use the low-level typed client.
- Add new public route prefixes to `client/middleware.ts` deliberately.
- Mirror new backend fields in raw response types, camelCase domain types,
  mappers, browser/server call paths, mock data where applicable, and tests.
- Use existing Radix/shadcn components and design tokens before creating new
  primitives or one-off color systems.
- Preserve accessibility: semantic controls, labels, focus behavior, keyboard
  operation, reduced-motion behavior, and legible contrast.
- Run at least targeted Vitest tests and ESLint for functional frontend work;
  run `npm run build` when routing, server/client boundaries, generated docs,
  config, or production compilation may be affected.

## Backend Rules

- Use `AppBaseModel` for new Pydantic schemas.
- Use `get_current_user`, `get_current_business`, `require_roles`, and
  `require_module` rather than custom auth checks where they apply.
- Services accept authoritative tenant IDs from dependencies, not unchecked
  request data.
- Explicitly commit before `publish()`; publishing is failure-tolerant and is
  not a transactional outbox.
- Preserve idempotency and legal transition rules in services.
- Treat MVP tab settlement as an audited external-register assertion. Do not
  add payment, tender, cash, receipt, refund, or fiscal semantics to that path.
- Keep tenant-configured tax profiles effective-dated and snapshot the applied
  operational estimate on order lines; never rewrite old orders after a rate
  change.
- Add PostgreSQL-backed integration tests for auth, tenancy, constraints, and
  route/service coordination.
- Install `requirements-test.txt` after a venv rebuild; runtime requirements do
  not include pytest.
- There is no established backend formatter, linter, or type checker yet. Match
  surrounding style and do not introduce a new quality tool incidentally.

## Database Rules

- Read `server/DATABASE.md` before migration work.
- Use a new, next-numbered SQL file and make it safe for the actual current
  schema.
- Consider data backfill, nullability, defaults, checks, indexes, foreign-key
  delete behavior, downgrade/recovery strategy, and lock duration.
- Validate both the migration path and ORM-metadata test path when practical.
- Treat `SEED_DATA=true` as demo-data mutation, not a harmless read.

## ML Rules

- Read `ml/CONTEXT.md` before model or pipeline work.
- Keep database access read-only except for the defined ML output tables.
- Avoid leakage: preserve time-aware evaluation for forecasting and
  appropriately stratified evaluation for classification.
- Report data sufficiency, baselines, cross-validation design, failure modes,
  and reproducibility details with model changes.
- Keep the frontend tolerant of an unavailable ML service.
- Do not expose the unauthenticated ML API to the public internet.

## Documentation Rules

- Use present tense in `ARCHITECTURE.md`.
- Keep product positioning, vocabulary, user-visible behavior, and deliberate
  exclusions in `PRODUCT.md`, not in technical implementation documents.
- Append dated entries to `HISTORY.md` for durable decisions or reusable
  pitfalls; include context, decision, consequences, and references.
- Keep only active or intentionally deferred work in `TODO.md`; explain the
  dependency or trigger for non-trivial work and mark completed items promptly.
- Avoid volatile counts, “all tests pass” claims, and dependency versions in
  prose when a manifest is the better source.
- Correct stale documentation in the same change when it would mislead the next
  agent.

## Communication and verification

- Lead with the outcome, then the evidence.
- State an assumption when it materially changes scope or design; ask only when
  two credible readings would produce different work.
- Name exact commands, checks, routes, or flows that ran, what passed, and what
  was only inspected. Never imply verification that did not occur.
- Report in-scope work that was blocked, intentionally deferred, or not done.
- For substantial work, end with a short “Deviations, all deliberate” section
  for any non-trivial departure from the requested or established approach.
