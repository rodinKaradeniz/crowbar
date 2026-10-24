# Deployment

Last reconciled with the repository on 2026-10-24.

## Status

Production hosting is not chosen. The intended target is the user's own VPS at
Hetzner; nothing is provisioned. Deployment remains an explicit user-authorized
activity: completing a local stage does not authorize provisioning,
configuration, migration, seeding or deployment anywhere.
[TODO.md](TODO.md) stage 9 owns the work. The supervised German pilot keeps a
separate compliant register as payment and fiscal authority, so no Crowbar
deployment is a TSE/DSFinV-K cash-register deployment.

## Topology and boundaries

These hold whatever the host turns out to be.

```text
Internet --> reverse proxy (TLS) --+--> web (Next.js)
                                   +--> api (FastAPI) --+--> PostgreSQL
                                                        +--> Redis
                                                        +--> ml (private FastAPI)

scheduled one-shot commands (table below) --> PostgreSQL (reminders also --> Twilio)
```

- Only `web` and `api` are public. PostgreSQL, Redis, `ml` and the scheduled
  commands stay private.
- One API replica until WebSocket fan-out is designed: connection managers live
  in one FastAPI process.
- `python -m db.migrate` (from `server/`) runs and succeeds before a new API
  starts; a failed migration stops the release. Never seed production data or
  use `db.migrate reset`.
- The reverse proxy in front of the API must set or overwrite `X-Real-IP`. In
  production the rate limiter takes that header as the client address.
- Next.js reaches the API privately through `API_INTERNAL_URL`.
  `NEXT_PUBLIC_API_URL` is the public API origin for browser calls and
  WebSockets; it is compiled into the build and is not secret.
- Uploads use the local filesystem. Do not expose them until durable storage
  with backup and deletion behaviour is in place.

## What a host must run

| Process | Command | Health or schedule (UTC) |
| --- | --- | --- |
| web | `npm run start` in `client/` | `GET /api/health` |
| api | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-access-log` in `server/` | `GET /api/health`, after migrations |
| ml | the `ml/Dockerfile` image; its entry point binds `$PORT` (default 8001) | `GET /health` |
| reservation reminders | `python -m app.jobs.reservation_reminders` in `server/` | `0 * * * *` |
| waitlist expiry | `python -m app.jobs.reservation_waitlist_expiry` | `*/5 * * * *` |
| account deletion | `python -m app.jobs.account_deletion` | `30 3 * * *` |
| customer retention | `python -m app.jobs.customer_retention` | `0 4 * * *` |
| inventory reconciliation | `python -m app.jobs.inventory_reconciliation` | `30 4 * * *` |

Each job runs one batch, closes its database engine and exits; there is no
persistent worker. Every module under `server/app/jobs/` has a row here — a job
that exists only as a module is a policy the product claims and does not keep.
Waitlist expiry is the only sub-hourly job because an offer lasts 15 minutes;
`expire_entry_if_due` also guards the read and accept paths, so a late run
costs visibility, not integrity. Retention and reconciliation run after close,
one after the other, so an anonymisation never lands mid-service.

## Secrets and configuration

Values never go in a committed file. Each `env.example` documents its variables;
the names are:

- web (`client/env.example`): `API_INTERNAL_URL`, `NEXT_PUBLIC_API_URL`,
  `NEXT_PUBLIC_WIDGET_BASE_URL`, `RESERVATION_FRAME_ANCESTORS`.
- api and jobs (`server/env.example`): `DATABASE_URL`, `REDIS_URL`,
  `ENVIRONMENT=production`, `RATE_LIMIT_ENABLED=true`, `RATE_LIMIT_HMAC_SECRET`,
  `SECRET_KEY`, `PUBLIC_LINK_SECRET_KEY`, `TABLE_QR_SECRET_KEY`,
  `ML_SERVICE_URL`, `ML_INTERNAL_TOKEN`, `CORS_ORIGINS`, `FRONTEND_URL`,
  `ACCESS_TOKEN_EXPIRE_MINUTES`, `TABLE_GUEST_SESSION_TTL_MINUTES`,
  `STORAGE_TYPE`, `UPLOAD_DIR`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`,
  `EMAIL_FROM_NAME`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_FROM_NUMBER`.
- ml (`ml/env.example`): `DATABASE_URL`, `DATABASE_URL_SYNC`,
  `ENVIRONMENT=production`, `ML_INTERNAL_TOKEN`, `LOG_LEVEL`,
  `MLFLOW_TRACKING_URI`.

`ML_INTERNAL_TOKEN` is one generated value shared by api and ml; generate every
other secret independently. `DEMO_ADMIN_PASSWORD` is for local seeding only.

## Frontend-only demo on Vercel

Separate from the Railway rollout, and like it, an action the user takes. The
demo is a Next.js build with no backend behind it (see
`docs/ARCHITECTURE.md` § Frontend-only demo).

- Root directory: `client`. Build and start: the Next.js defaults.
- Environment, for both Build and Runtime: **`NEXT_PUBLIC_CROWBAR_DEMO=true`,
  and nothing else.**
- Leave every backend, Resend, Twilio, ML and `RESERVATION_FRAME_ANCESTORS`
  variable unset. The build refuses to run if an API URL points anywhere but a
  `/demo-api` mock, so a demo cannot be pointed at a real backend by mistake.
- The demo answers every backend call inside its own process, so it makes no
  outbound request and no request to itself. Deployment Protection on preview
  URLs is therefore not a problem, and each request costs one function
  invocation rather than two.
- Because `NEXT_PUBLIC_*` is inlined at build time, changing this requires a
  redeploy.
- The demo stores nothing server-side. What a visitor changes lives in one
  httpOnly cookie in their own browser, so visitors never see each other's
  evening and nothing about them is retained after it expires. There is no
  database, no log of what they did, and nothing to erase.
