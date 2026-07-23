# Current Plans and Reminders

This is the canonical roadmap for agents. Items are not authorization to expand
the current task: confirm scope with the user's request before implementing
them.

Status labels:

- **Ready:** sufficiently understood to plan.
- **Needs decision:** product or architecture choice is unresolved.
- **Blocked:** requires external state or authority.
- **Deferred:** intentionally not current.

## Documentation Transition

- **Ready:** Reconcile `README.md` with current manifests and routes. It is a
  useful quick start, but endpoint inventory and some narrative details drift
  as features evolve.
- **Ready:** Reconcile environment examples with every supported mode,
  including frontend mock mode, `ML_SERVICE_URL`, and the eventual production
  CORS configuration.
- **Ready:** Gradually decompose unique, still-valid detail from `CLAUDE.md`
  into `ARCHITECTURE.md`, `HISTORY.md`, or focused references; then reduce
  `CLAUDE.md` to a compatibility pointer for Claude-based tools.
- **Ready:** Reconcile or retire `docs/backlog.md`. It still lists implemented
  work (staff invitations, phone normalization, SMS reminder deduplication) and
  removed payment columns as if they were current.
- **Ready:** Add nested `AGENTS.md` files only when client, server, or ML work
  develops genuinely different recurring instructions. Avoid duplicating the
  root guide.

## Production and Delivery

- **Needs decision:** Choose and implement the production topology. The Vercel
  + EC2 design in `docs/deployment.md` is a proposal; its Dockerfile, production
  Compose file, and GitHub Actions workflow do not exist.
- **Ready:** Add CI for frontend lint/test/build and backend tests. Decide how
  CI provisions PostgreSQL and validates the SQL migration chain.
- **Ready:** Add backend formatting/linting/type-check policy and ML tests
  deliberately; none is currently established.
- **Ready:** Define production process topology for FastAPI, Redis stream
  consumption, Celery worker, Celery beat, and ML.
- **Ready:** Add backup/restore testing, migration rollout and rollback
  procedures, secret management, HTTPS, restricted service networking, durable
  upload storage, health checks, and deployment observability.
- **Ready:** Repair or remove the documented `python -m db.migrate reset`
  workflow. Its drop list predates many current tables, so it is destructive
  without being a reliable full reset.
- **Needs decision:** Design multi-replica WebSocket fan-out. Current connection
  managers live in one FastAPI process.

## Security and Reliability

- **Ready:** Replace `frame-ancestors *` on embeddable reservation pages with an
  intentional per-business or deployment allowlist.
- **Ready:** Keep the unauthenticated ML API private or add service
  authentication before exposing it beyond a trusted network.
- **Ready:** Add rate limiting and abuse controls to public reservation, queue,
  ordering, auth, and docs-assistant endpoints.
- **Ready:** Decide whether Redis event delivery needs a transactional outbox,
  dead-letter handling, replay tools, and metrics. Publishing is currently
  best-effort.
- **Ready:** Correct reservation event ordering. Reservation routes currently
  publish after a flush but before the request dependency commits, unlike
  queue/order/inventory paths; either commit first or solve this as part of an
  outbox design before adding reservation event consumers.
- **Ready:** Evaluate the Celery async task design under the chosen production
  worker pool.
- **Ready:** Add structured tracing, metrics, SLOs, alerting, and request/event
  correlation beyond current request logs.
- **Ready:** Harden onboarding redirects across all business routes rather than
  only selected pages.

## Product Architecture

- **Needs decision:** Replace hard-coded `kitchen | bar | any` routing tags with
  configurable stations.
- **Needs decision:** Implement granular permission-based RBAC and a full audit
  system. Current owner/manager/staff roles are coarse, and the order timeline
  is not a platform audit log.
- **Needs decision:** Design active context for dual-role or multi-business
  accounts before changing the one-business tenancy assumption.
- **Deferred:** Multi-location management and location filtering UI.
- **Ready:** Replace the sidebar queue-count poll with shared real-time state
  when the queue socket is lifted into a common provider.
- **Needs decision:** Add real-time tab updates; tab detail is currently
  refresh-driven.
- **Deferred:** Public servings/pours display, stronger ID verification, and
  table registration for tabs.
- **Deferred:** Reviews, WhatsApp, and billing/subscription processing. Stripe
  packages remain installed, but current payment columns and product flows were
  removed.

## Data and ML

- **Needs decision:** Define ML V2 outcomes before adding models. Existing
  candidates include waste/loss analysis, reorder suggestions, and richer
  operational forecasting.
- **Ready:** Establish reproducible training/evaluation artifacts and tests;
  current latest results are process-memory state backed by durable prediction
  tables.
- **Ready:** Add model/data drift monitoring, minimum-data thresholds, model
  versioning, and scheduled pipeline execution.
- **Ready:** Review whether the ML service should retain write access only to
  its output tables through a restricted database role.
