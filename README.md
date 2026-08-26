# Crowbar

Crowbar is a portfolio implementation of a multi-tenant operations platform
for bars and restaurants. It brings reservations, a walk-in queue, floor and
table management, QR ordering, preparation routing, tabs, inventory, customer
records, and operational reporting into one service loop.

The MVP deliberately does **not** process payments or create fiscal records.
Its only settlement action records that a tab was **settled externally** in the
venue's separate compliant register.

## Architecture

- `client/` — Next.js 16, React 19, TypeScript, Tailwind, Radix, and shadcn/ui
- `server/` — FastAPI, async SQLAlchemy, PostgreSQL, Redis Streams, and WebSockets
- `ml/` — private FastAPI service for operational demand forecasting
- `server/db/migrations/` — ordered, append-only SQL migrations
- `scripts/dev.sh` — local PostgreSQL, Redis, ML, API, and web development loop

Security-relevant design choices include explicit tenant scoping, composite
tenant constraints, purpose-specific signed capabilities, HttpOnly guest
cookies, staff-approved table sessions, commit-before-publish events, and
allowlisted public response models.

## Local quick start

Prerequisites: Docker, Node.js 20+, npm, and Python 3.12+.

```bash
cp server/env.example server/.env
cp ml/env.example ml/.env
cd client && npm ci && cd ..
cd server && python -m venv venv && venv/bin/pip install -r requirements.lock && cd ..
./scripts/dev.sh
```

The web app starts at `http://localhost:3000`; the API defaults to
`http://localhost:8000`. `dev.sh` applies migrations but does not seed. Demo
data is optional and separate from migrations:

```bash
SEED_DATA=true ./scripts/dev.sh
```

The local-only seeder requires a unique `DEMO_ADMIN_PASSWORD` of at least 12
characters and refuses non-local database hosts. `dev.sh` generates a throwaway
value per run and prints it; export your own `DEMO_ADMIN_PASSWORD` first to pin
a login you can reuse.

Useful checks:

```bash
cd client && npm run lint && npm run test:run && npm run build
cd server && venv/bin/python -m pytest
cd ml && python -m pytest
```

## Portfolio status

This repository is source for review, not a hosted product or a promise of
production availability. Deployment details, operational evidence, internal
roadmaps, agent configuration, and private development history are excluded
from the curated public mirror.

See [SECURITY.md](SECURITY.md) for responsible disclosure and
[LICENSE](LICENSE) for viewing terms.
