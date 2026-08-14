# Railway Deployment Runbook

Last reconciled with the repository, preserved Railway rollout, and confirmed
MVP deployment gate on 2026-08-14.

## Deployment Gate

Railway is the confirmed target, but deployment remains paused until MVP stages
0–7 pass locally and the user explicitly authorizes external deployment work.
Local completion does not itself authorize provisioning, configuration,
migration, seeding, deployment, or deletion in Railway. The supervised German
pilot keeps a separate compliant register as payment/fiscal authority; this
topology must not be presented as a TSE/DSFinV-K cash-register deployment.

## Confirmed Topology

Crowbar deploys into one Railway project in EU West.

```text
Internet
  |
  +--> web (Next.js) ----------+
  |                            |
  +--> api (FastAPI) ----------+--> PostgreSQL
                               +--> Redis
                               +--> ml (private FastAPI)

reminders (hourly private cron) ---> PostgreSQL ---> Twilio
```

Only `web` and `api` receive public domains. PostgreSQL, Redis, `ml`, and
`reminders` remain private. Future domain microservices remain private behind
the FastAPI gateway unless a new architecture decision says otherwise.

## Source and Process Contract

Each code service uses the same GitHub repository with an isolated root
directory. Railway config files use absolute repository paths because a
service's Root Directory does not automatically relocate its config-as-code
file.

| Service | Root directory | Config file | Builder | Process |
| --- | --- | --- | --- | --- |
| `web` | `/client` | `/client/railway.json` | Railpack | `npm run start` |
| `api` | `/server` | `/server/railway.api.json` | Railpack | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| `ml` | `/ml` | `/ml/railway.json` | Dockerfile | Docker `CMD`, listening on `$PORT` |
| `reminders` | `/server` | `/server/railway.reminders.json` | Railpack | `python -m app.jobs.reservation_reminders` |

Watch patterns prevent unrelated monorepo changes from rebuilding every
service.

## Deployment Lifecycle

- `web` must return HTTP 200 from `/api/health` before Railway activates a new
  deployment.
- `api` must connect to PostgreSQL and return HTTP 200 from `/api/health`.
- `ml` must connect to PostgreSQL and return HTTP 200 from `/health`.
- `api` runs `python -m db.migrate` as a pre-deploy command. A migration failure
  stops the new deployment before it becomes active.
- `reminders` runs at `0 * * * *` UTC, completes one batch, closes its database
  engine, and exits. It has no public domain and no persistent worker.

Do not seed production data or use `db.migrate reset`.

## Networking Contract

- Next.js uses `API_INTERNAL_URL` for server components, route handlers, and
  BFF traffic over Railway private networking.
- `NEXT_PUBLIC_API_URL` is the public FastAPI origin used only where browser
  access is required, including WebSockets. It is compiled into the Next.js
  build and is not secret.
- FastAPI uses `ML_SERVICE_URL` for the private ML origin and sends
  `ML_INTERNAL_TOKEN`.
- FastAPI and ML receive PostgreSQL connection URLs through Railway reference
  variables. Their settings normalize Railway's provider-standard URL for the
  async and sync SQLAlchemy drivers.
- FastAPI receives Redis through a Railway reference variable.
- Database, Redis, and ML services do not receive public domains.

## Secrets and Configuration

Values belong in Railway Variables, never committed environment files.

At minimum:

- `web`: `API_INTERNAL_URL`, `NEXT_PUBLIC_API_URL`; both
  `DOCS_ASSISTANT_ENABLED=true` and `OPENAI_API_KEY` only when the optional docs
  assistant is deliberately enabled; and any optional OpenAI model overrides. Set
  `RESERVATION_FRAME_ANCESTORS` to a comma-separated list of exact `https://`
  origins authorized to embed public reservation pages. It defaults to
  `'self'`; wildcards are rejected.
- `api`: `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, `ENVIRONMENT=production`,
  `RATE_LIMIT_ENABLED=true`, `FRONTEND_URL`, `CORS_ORIGINS`, `ML_SERVICE_URL`,
  `ML_INTERNAL_TOKEN`, and configured email/SMS provider credentials.
- `ml`: set both `DATABASE_URL` and `DATABASE_URL_SYNC` to the Postgres
  `DATABASE_URL` reference; Crowbar selects the appropriate driver.
  Also set `ENVIRONMENT=production`, `ML_INTERNAL_TOKEN`, and logging
  configuration.
- `reminders`: `DATABASE_URL`, `ENVIRONMENT=production`, and Twilio
  credentials. It does not need Redis.

Use one strong generated value for `ML_INTERNAL_TOKEN` on both `api` and `ml`.
Use a different strong generated value for `SECRET_KEY`.

## Storage

The backend's current local upload service is not production-durable on
ephemeral application filesystems. Do not expose uploads until a Railway volume
or object-storage adapter is configured and its backup/deletion behavior is
confirmed. Object storage remains the preferred long-term shape.

## Rollout State

**Status:** Intentionally paused while product development completes and passes
the local MVP release gate. Do not resume external deployment changes without
a new explicit instruction.

- Complete: Railway project created.
- Complete: public/private trust boundaries and tenant-scoped ML gateway.
- Complete: production build and backend regression verification.
- Complete: service build/start/health/migration/cron definitions checked in.
- Complete: managed PostgreSQL and Redis services online in EU West.
- Complete: public FastAPI service online in EU West with its database and
  Redis references, migrations 001–022, stream consumer, public domain, and
  health check verified.
- Pending before any migration rollout: reconcile that preserved 001–022
  database with local migrations 023–036, the exact accepted application
  version, forward recovery, and a backup/restore checkpoint.
- Pending: deploy the local rate-limit change to FastAPI, set
  `RATE_LIMIT_ENABLED=true`, and verify 429/proxy behavior in Railway.
- Pending: GitHub-backed `ml`, `reminders`, and `web` services plus production
  scheduling for customer retention.
- Pending: their reference variables and secrets, the web domain and CORS,
  private ML connectivity, and end-to-end smoke tests.
- Pending: durable uploads, backups, monitoring, and release automation.

Deployment actions remain explicit user-confirmed steps. A TODO entry or this
runbook is not authorization to mutate Railway.
