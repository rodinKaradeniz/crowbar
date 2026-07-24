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

## Testing and Quality

- **Needs decision:** Define the repository-wide testing strategy and risk-based
  quality gates: which behavior belongs in unit, integration, contract,
  end-to-end, visual, accessibility, performance, security, and migration
  tests.
- **Ready:** Expand frontend tests beyond the current focused Vitest and MSW
  coverage, especially for ordering, reservations, module gates, money/time
  mapping, error states, and HTTP/WebSocket mapper parity.
- **Ready:** Expand PostgreSQL-backed backend integration coverage for every
  module, tenant isolation, roles, public endpoint abuse cases, idempotency,
  legal state transitions, and inventory ledger effects.
- **Needs decision:** Select an end-to-end browser framework and a small set of
  critical user journeys. Evaluate Playwright against the value of
  browser-level coverage before introducing it.
- **Ready:** Add migration-chain tests against a fresh database in addition to
  ORM-metadata tests, including seed validation and a reliable disposable reset
  path.
- **Ready:** Add ML unit, pipeline, minimum-data, reproducibility, and
  leakage-regression tests.
- **Ready:** Establish accessibility checks, responsive/visual regression,
  performance budgets, and failure-mode tests for critical flows.

## CI/CD

- **Ready:** Add a simple pull-request CI pipeline: frontend lint/test/build;
  backend tests with PostgreSQL; fresh-database migrations; ML import/tests;
  and documentation/link checks.
- **Ready:** Add dependency, secret, and vulnerability scanning with actionable
  failure policies rather than noisy report-only tooling.
- **Needs decision:** Choose branch protection and required checks, including
  whether expensive end-to-end or performance suites run per pull request,
  nightly, or before release.
- **Needs decision:** Add a simple CD pipeline after choosing the deployment
  target. Include staging, environment-specific configuration, migration
  ordering, health checks, smoke tests, rollback, and a manual production gate
  until releases are proven routine.
- **Ready:** Make releases traceable to a commit and preserve deploy, migration,
  worker, and model versions in operational metadata.

## Deployment

- **Needs decision:** Choose and implement the production topology. The Vercel
  + EC2 design in `docs/deployment.md` is a proposal; its Dockerfile, production
  Compose file, and GitHub Actions workflow do not exist. Compare it with
  managed container/application platforms before committing to operational
  ownership.
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
- **Deferred:** Reviews and billing/subscription processing. Stripe packages
  remain installed, but current payment columns and product flows were removed.

## Client Applications

- **Needs decision — Mobile app:** Define the primary audience and native-only
  value before choosing technology. Staff shift operations, owner analytics,
  and customer booking/ordering are different products. Compare a stronger
  responsive web/PWA experience with React Native, Expo, Flutter, and native
  apps based on offline behavior, push notifications, camera/QR, background
  work, device integrations, distribution, and team capacity.
- **Needs decision — Desktop app:** Identify desktop-specific workflows before
  wrapping the web app. Compare an installable PWA with Tauri or Electron based
  on offline resilience, kitchen/bar display mode, receipt printers, cash
  drawers, local networking, automatic updates, kiosk operation, and OS
  integration.
- **Needs decision:** Define a shared API, authentication, entitlement,
  observability, release, and design-system strategy across web, mobile, and
  desktop without forcing every client into identical interaction patterns.

## Conversational AI

- **Needs decision — WhatsApp reservation bot:** Let customers discover
  availability and create, confirm, change, or cancel reservations through a
  WhatsApp conversation. Decide whether Twilio WhatsApp or Meta's Cloud API is
  the initial transport and whether the first release is deterministic,
  AI-assisted, or fully tool-calling.
- **Ready:** Reuse the existing reservation, customer-identity, notification,
  channel, and idempotency paths rather than creating a second booking engine.
  Use the existing `bot_configs` and `bot_enabled` foundations only after
  verifying they fit the agreed conversation model.
- **Needs decision:** Design explicit confirmation before writes, business and
  location resolution, human handoff, unsupported-request recovery,
  multilingual behavior, message-window/template rules, opt-in/opt-out,
  transcript retention, deletion, and staff visibility.
- **Ready:** Threat-model prompt injection, impersonation, duplicate webhook
  delivery, replay, stale availability, PII exposure, unsafe tool calls,
  provider outages, cost spikes, and hallucinated policies. The model must
  never invent availability, pricing, booking status, or business rules.
- **Ready:** Build conversation simulations and evaluation sets for successful
  booking, ambiguity, corrections, cancellations, no availability, abusive
  input, provider retry, and human escalation before production rollout.
- **Deferred:** Generalize the channel adapter to Instagram, web chat, SMS, or
  voice only after the WhatsApp workflow and operational model are validated.

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
