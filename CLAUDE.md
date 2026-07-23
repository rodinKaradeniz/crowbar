# Crowbar — Claude Code Guide

> **Cross-agent entry point:** Read [`AGENTS.md`](AGENTS.md) first, followed by
> [`docs/RULES.md`](docs/RULES.md). This file is retained as the detailed legacy
> phase archive; current architecture, decisions, and plans are organized under
> `docs/`.

## Project Overview

**Crowbar** is a multi-module operations platform for bars and restaurants.
The stack is a Next.js frontend + FastAPI backend + PostgreSQL + Redis, with a separate ML service.
Current cross-agent context lives in `AGENTS.md` and `docs/`; detailed product
direction and the legacy phase history remain in this file.

---

## Dev Commands

```bash
# Start everything (Docker + FastAPI + Next.js)
./scripts/dev.sh

# Backend only (from server/)
source venv/bin/activate && uvicorn app.main:app --reload --port 8000

# Background jobs (from server/, venv active) — reservation SMS reminders
celery -A app.celery_app worker --loglevel=info --pool=solo   # worker
celery -A app.celery_app beat   --loglevel=info               # hourly scheduler

# Run migrations (from server/)
python -m db.migrate

# Run migrations with seed data (loads 001_seed_puzzles.sql)
SEED_DATA=true python -m db.migrate

# Frontend only (from client/)
npm run dev

# Frontend in mock/demo mode — no backend needed (static mock data)
NEXT_PUBLIC_USE_MOCK_API=true npm run dev
```

**Default ports:** Frontend 3000 · Backend 8000 · ML 8001 · PostgreSQL 5432 · Redis 6379

**API docs:** http://localhost:8000/docs

### Running the backend test suite

```bash
# From server/ — test deps are a SEPARATE manifest from runtime deps
venv/bin/python -m pip install -r requirements-test.txt   # pytest, pytest-asyncio, pytest-cov
docker exec crowbar-db createdb -U postgres crowbar_test   # one-time; conftest needs it
venv/bin/python -m pytest                                  # 46 tests, all passing
```

**Why this isn't automatic (root cause of a recurring "tests won't run" breakage):**
`scripts/dev.sh` rebuilds `venv/` from `requirements.txt` **only** — it never installs
`requirements-test.txt`, so `pytest` is absent from every freshly-rebuilt venv (this is what
broke, not a missing manifest entry: `phonenumbers` and all runtime deps *are* correctly listed
in `requirements.txt`). The test deps live in `requirements-test.txt` (`-r requirements.txt` +
pytest/pytest-asyncio/pytest-cov) by design; reinstall it after any venv rebuild. Separately,
`tests/conftest.py` uses an autouse fixture that creates ORM tables (not migrations) in a
dedicated `crowbar_test` database, so that DB must exist on the running Postgres container. A
stale `server/.venv/` (note the leading dot) from the pre-rename `rk-reservations` path also
exists and is broken — the live venv is `server/venv/`.

---

## Stack

| Layer             | Technology                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Frontend          | Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui, Sonner (toasts)                                                  |
| Backend           | FastAPI (Python), SQLAlchemy (async), Alembic-less custom migrator                                                         |
| Database          | PostgreSQL (asyncpg driver)                                                                                                |
| Cache / real-time | Redis 7 (also Celery broker/backend + event stream)                                                                        |
| Background jobs   | Celery worker + beat (`server/app/celery_app.py`) — hourly reservation reminder sweep                                      |
| Auth              | JWT (httpOnly cookie `rk-token`), FastAPI dependencies                                                                     |
| Notifications     | In-app (DB-backed) + Email (Resend) + SMS (Twilio, optional)                                                               |
| File storage      | `storage_service.py` abstraction — `LocalStorageService` (writes to `upload_dir`); pluggable for S3 later                  |
| ML                | Separate FastAPI service on :8001 (RFM segmentation, cancellation prediction, 7-day forecast)                              |
| Demo mode         | Frontend mock layer (`NEXT_PUBLIC_USE_MOCK_API=true` → `api-mock.ts` + `mock-data.ts`); serves static data with no backend |

---

## Environment Setup

**Server** — copy `server/env.example` → `server/.env`
Key vars: `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, `RESEND_API_KEY`
Optional: `TWILIO_*` (SMS)

**Client** — copy `client/env.example` → `client/.env.local`
Key vars: `NEXT_PUBLIC_API_URL=http://localhost:8000`
Optional: `OPENAI_API_KEY` (docs RAG assistant), `NEXT_PUBLIC_USE_MOCK_API=true` (demo mode, no backend)

---

## Repository Layout (High Level)

```
rk-reservations/
├── docs/
│   └── deployment.md          # Vercel + EC2: Next.js, FastAPI, Postgres, Redis, ML
├── scripts/
│   ├── dev.sh                 # Starts Docker (postgres, redis, ml), FastAPI :8000, Next :3000
│   └── stop.sh
├── client/                    # Next.js (App Router)
│   ├── app/
│   │   ├── layout.tsx, page.tsx (landing), globals.css
│   │   ├── auth/              # login, register, forgot/reset password
│   │   ├── invite/[token]/    # staff invitation accept flow (see migration 012)
│   │   ├── api/               # proxy, auth routes, business-docs-chat, ws-token,
│   │   │                      # invite, search
│   │   ├── business/          # dashboard: overview, reservations, schedule, insights,
│   │   │                      # staff, customers, requests, queue, menu, inventory,
│   │   │                      # orders (ticket board), profile, settings, docs
│   │   ├── reserve/[business]/ # public booking flow
│   │   ├── queue/[business]/  # public queue join flow
│   │   ├── menu/[business]/   # public QR menu
│   │   └── order/[business]/  # public cart + order placement
│   ├── components/            # UI, sidebars, reservation forms, dashboard shell, etc.
│   ├── contexts/              # e.g. auth-context
│   ├── hooks/                 # use-auth, use-queue-socket, use-order-socket, etc.
│   ├── lib/                   # api.ts, api-client.ts, client-api.ts, api-mock.ts (demo),
│   │                          # mock-data.ts, ml-api.ts, business-docs-rag.ts, modules.ts
│   ├── content/docs/          # MDX business docs (source for RAG assistant)
│   ├── middleware.ts
│   └── package.json
├── server/                    # FastAPI monolith
│   ├── app/
│   │   ├── main.py
│   │   ├── celery_app.py      # Celery worker + beat (hourly reservation reminder sweep)
│   │   ├── config.py, database.py, dependencies.py
│   │   ├── routers/           # auth, businesses, reservations, staff, customers,
│   │   │                      # service_types, analytics, notifications, queue,
│   │   │                      # ordering, inventory
│   │   ├── models/            # user, business, staff, staff_invitation, reservation,
│   │   │                      # service_type, notification, queue_entry, location,
│   │   │                      # customer, table, bot_config, menu/order/inventory models
│   │   ├── schemas/           # Pydantic response/request schemas (e.g. customer.py)
│   │   ├── constants/         # notifications.py (notification kind constants)
│   │   ├── services/          # auth, business, reservation, reservation_notifications,
│   │   │                      # staff, customer, customer_identity, analytics,
│   │   │                      # notification, email, sms, storage, queue, menu, order,
│   │   │                      # inventory (+ queue_ws_manager, order_ws_manager)
│   │   └── core/              # events.py, redis_client.py, stream_consumer.py, ws_projections.py
│   ├── db/
│   │   ├── migrate.py
│   │   ├── migrations/        # 001–016 SQL files
│   │   └── seeds/             # 001_seed_puzzles.sql (Puzzles Bar demo)
│   └── tests/
└── ml/                        # Separate Python service (FastAPI on :8001)
    ├── src/
    │   ├── main.py, config.py, db.py
    │   ├── features/          # customer_features, reservation_features
    │   ├── models/            # demand_forecast, cancellation, segmentation
    │   └── pipelines/         # insights_pipeline
    └── notebooks/
```

---

## Architecture Conventions

### Backend

- **Tenant scoping:** every query must filter by `business_id` from the authenticated context (`get_current_business` dependency), never from request body/path params.
- **Module guards:** use `require_module("module_name")` as a FastAPI dependency on all module routes. Returns 403 `MODULE_DISABLED` if not enabled.
- **Auth dependencies:** `get_current_user` → resolves `User`; `get_current_business` → resolves `Business` (reads `business_id` from JWT).
- **Migrations:** plain SQL files in `server/db/migrations/`, applied in order by `server/db/migrate.py`. Tracked in `_migrations` table by filename.
- **Models:** all use `Base + UUIDMixin + TimestampMixin` (`server/app/models/base.py`).
- **Notifications:** `notification_service.notify_business_staff(db, business_id, kind, title, body, payload, exclude_user_id)` fans out an in-app `Notification` row to every staff member of the business.

### Frontend

- **API calls:** all client-side API calls go through `client/lib/client-api.ts`. Authenticated calls use `authFetch`; public (no auth) calls use `clientFetch`.
- **Public routes:** declared in `client/middleware.ts`. Must add new public route prefixes there (e.g. `/queue/`, `/reserve/`).
- **Types:** shared types in `client/types/index.ts`. Snake_case from API → camelCase in frontend via mapper functions.
- **Real-time (WebSocket):** JWT is an httpOnly cookie, not readable by JS. The client fetches a short-lived token from `/api/ws-token` (Next.js server route) before opening a WebSocket connection.

---

## Migration File Index

| File                                        | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `001_initial_schema.sql`                    | Core tables: users, businesses, staff, reservations, service_types                                                                                                                                                                                                                                                                                                                                                                                              |
| `002_ml_tables.sql`                         | ML output tables                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `003_online_reservations.sql`               | Online booking fields                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `004_notifications.sql`                     | In-app notifications table                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `005_locations_and_module_flags.sql`        | Locations table, `enabled_modules` JSONB on businesses                                                                                                                                                                                                                                                                                                                                                                                                          |
| `006_onboarding_notifications_calendar.sql` | Onboarding wizard state, notification channels, calendar tokens                                                                                                                                                                                                                                                                                                                                                                                                 |
| `007_queue_entries.sql`                     | Queue entries table (Phase 1.5)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `008_ordering.sql`                          | Ordering tables: menus, categories, items, modifiers, orders, line items, status timeline                                                                                                                                                                                                                                                                                                                                                                       |
| `009_item_library.sql`                      | Item library table (`item_library`) + `is_accepting_orders` boolean column on businesses                                                                                                                                                                                                                                                                                                                                                                        |
| `010_inventory.sql`                         | Inventory tables: `inventory_items`, `stock_movements`, `menu_item_ingredients` (recipe stub)                                                                                                                                                                                                                                                                                                                                                                   |
| `011_sms_reminder_dedup.sql`                | Add `sms_reminder_sent` boolean to `reservations` to prevent duplicate SMS on worker restart                                                                                                                                                                                                                                                                                                                                                                    |
| `012_staff_invitations.sql`                 | `staff_invitations` table — invite new staff by email token                                                                                                                                                                                                                                                                                                                                                                                                     |
| `013_remove_google_payment_stubs.sql`       | Drop `google_oauth_tokens`; remove payment columns (`payment_amount`, `payment_status`, `stripe_payment_intent_id`), meeting/calendar columns, and `is_online`/`requires_payment`/`amount`/`form_fields` from `service_types`                                                                                                                                                                                                                                   |
| `014_multi_channel_foundations.sql`         | New tables: `customers` (business-scoped, phone-keyed identity), `tables` (per-table QR ordering), `bot_configs` (per-channel bot settings). Adds nullable `customer_id`, `channel`, `fulfillment_type`, `table_id`, `delivery_address`, `scheduled_for` on `orders`; `channel`, `idempotency_key` on `reservations` and `queue_entries`. Adds `ordering_config` (jsonb, default `{"allowed_fulfillment_types":["dine_in"]}`) and `bot_enabled` on `businesses` |
| `015_reservations_customer_cutover.sql`     | Drop legacy `reservations.customer_id` FK to `users`; promote `customer_id_new` → `customer_id` (NOT NULL, FK to `customers`). Delete orphaned `users.user_type='customer'` rows                                                                                                                                                                                                                                                                                |
| `016_tabs.sql`                              | New `tabs` table (open/closed, opened_by/closed_by → users, `settled_method`, nullable `table_id`/`customer_id`); adds nullable `orders.tab_id` FK. Tabs group orders under one running total; total is computed on demand (no denormalized column)                                                                                                                                                                                                             |
| `017_happy_hour_and_timezone.sql`           | Adds `businesses.timezone` (`VARCHAR(64)`, NOT NULL default `'UTC'`, IANA name). New `happy_hour_windows` table (business-wide windows: `name`, `days_of_week INT[]` with 0=Monday..6=Sunday, wall-clock `start_time`/`end_time` TIME interpreted against `businesses.timezone`, `is_active`). Adds nullable `menu_items.happy_hour_price NUMERIC(10,2)` (flat override; NULL = never discounts)                                                                  |
| `018_age_verification.sql`                  | Age verification (self-attestation). Adds `menu_items.is_alcoholic BOOLEAN NOT NULL DEFAULT false`; `order_line_items.is_alcoholic BOOLEAN NOT NULL DEFAULT false` (snapshot at placement, like `routing_tag`); `orders.age_confirmed BOOLEAN NOT NULL DEFAULT false` (the attestation, recorded on the order); `businesses.legal_drinking_age INT NOT NULL DEFAULT 18` (configurable per country; never hardcoded). Whether an order "contains alcohol" is derived from its line items on demand — not stored                                          |
| `019_pour_keg_and_recipes.sql`              | Pour/keg inventory + recipe wiring (Tier B ∪ Phase 8). Adds `inventory_items.unit_type VARCHAR(16) NOT NULL DEFAULT 'each'` (`each`=countable, unchanged; `bottle`/`keg`=liquid tracked in **ml**) and `inventory_items.container_volume_ml NUMERIC(10,3)` (ml per bottle/keg; NULL for `each`). Makes the dead `menu_item_ingredients` stub real: **drops its redundant `unit` column** and keeps `quantity` (reinterpreted as amount in the linked inventory item's native unit — ml for bottle/keg, count for `each`). Adds `'sale'` to the `stock_movements.movement_type` CHECK (auto recipe deduction, distinct from receive/adjust/waste) |
| `020_order_status_history_and_movement_order_ref.sql` | Ticket-board redesign support (Phase B.5). Adds nullable `order_status_timeline.from_status VARCHAR(20)` — the existing timeline **is** the status audit log; every real transition records from→to, and the initial `received` placement row keeps `from_status`/`changed_by` NULL (a creation, not a transition). Adds nullable `stock_movements.order_id` FK (→ `orders`, `ON DELETE SET NULL`) + index so recipe `'sale'` deductions are linkable back to their order (previously only a free-text note). Extends the `stock_movements.movement_type` CHECK to include `'sale_reversal'` (system-generated credit-back when an order moves backward out of `served`) |
| `021_stock_movement_waste_reason.sql` | Structured waste cause for manual inventory correction. Adds nullable `stock_movements.reason VARCHAR(20)` guarded by `CHECK (reason IS NULL OR reason IN ('spillage','wrong_measure','breakage','spoilage','other'))` — modeled exactly like `movement_type` (a CHECK-guarded VARCHAR, **not** a lookup table). Nullable: older/pre-existing `waste` rows and all non-waste movements leave it NULL. Reason is scoped to `waste` in the service/API layer (**required** there; optional for `adjust`; rejected for `receive`) — the DB constraint validates only the value domain, not which movement_type may use it. The existing `notes` column is reused for optional free-text detail (no separate `note` column). Enables later "waste per item" aggregation (Phase 9 ML V2). See Non-Obvious #42 |
| `022_default_pour_size.sql` | Optional reference pour size for the rough pours-remaining estimate. Adds nullable `inventory_items.default_pour_ml NUMERIC(10,3)` — a generic reference pour (ml) used ONLY to compute `floor(current_quantity / default_pour_ml)` as a rough staff estimate, independent of any recipe. **No default** (unset = "no estimate", never a fabricated fallback); meaningful only for `bottle`/`keg` (ml-tracked) items, `each` items leave it NULL. No count is stored — computed **live client-side** (compute-on-demand, like the tab total). Distinct from the recipe-exact menu-item "servings remaining" (computed in `recipe_service` from `menu_item_ingredients`, also stored nowhere). See Non-Obvious #44 |

---

## Module Status

| Module         | Status               | Notes                                                                                                                                                                                                                                                                          |
| -------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `reservations` | Complete             | Core booking flow, staff management, analytics                                                                                                                                                                                                                                 |
| `queue`        | Complete (Phase 1.5) | Walk-in queue, WebSocket live board, SMS on call                                                                                                                                                                                                                               |
| `ordering`     | Complete (Phase 2)   | QR menu, cart, order placement (idempotent), **status-column ticket board** (Phase B.5) — Kanban columns received/preparing/ready/served with an All/Kitchen/Bar station **filter** (not a grid axis), forward + one-step-backward move controls (backward out of `served` reverses inventory), and a per-ticket status **history**; WebSocket; item library (reusable templates, copy-on-add); ordering on/off toggle (`is_accepting_orders`); **tabs** (Phase B.1) — group orders under one running total, close with simulated settlement; **happy hour** (Phase B.2) — timezone-aware windows discount opted-in items on both the menu read and order placement paths; **age verification** (Phase B.3) — `is_alcoholic` menu flag drives a checkout self-attestation (server-re-validated via `age_confirmed`, channel-scoped) + an alcohol badge on staff tickets |
| `inventory`    | Complete (Phase 3)   | Stock items, movements (receive/adjust/waste + auto **sale** deductions), par levels, low-stock alerts. **Pour/keg (Phase B.4):** `unit_type` (`each`/`bottle`/`keg`) with liquid quantities tracked in ml; `container_volume_ml` for container→ml receive. **Recipes (Phase 8/B.4):** `menu_item_ingredients` is now live — recipes auto-deduct on order `served`, zero-stock auto-disables the menu item (manual re-enable), and below-par ingredients surface a menu-item low-stock badge. **Manual correction:** delta-based `waste`/`adjust` movements carry a structured `waste` reason enum (spillage/wrong_measure/breakage/spoilage/other) with an ml/oz toggle for liquids — see Non-Obvious #42. **Servings/pours remaining (post-B.5):** menu-item recipe-exact "~N servings left" badge + optional per-bottle/keg `default_pour_ml` → rough "~N pours left (est.)" — both live/unstored, staff-facing — see Non-Obvious #44 |
| `insights`     | Complete (Phase 5)   | ML outputs surfaced (segmentation, cancellation, demand forecast); operational KPIs (reservations/ordering/inventory); high-risk reservation flagging; overview carousel shows 3-day forecast slide                                                                            |

## Demo-Hardening Status (Phase 5.5)

All P0 and P1 hardening items are complete:

| Item                                                            | Status  |
| --------------------------------------------------------------- | ------- |
| `error.tsx`, `not-found.tsx`, `business/error.tsx`              | ✅ Done |
| `DashboardErrorBoundary` class component in layout              | ✅ Done |
| `client/lib/modules.ts` — shared `hasModule()` + `MODULE_KEYS`  | ✅ Done |
| Settings → Modules page (`/business/settings/modules`)          | ✅ Done |
| Module-disabled server-side guards on all module page.tsx files | ✅ Done |
| `ModuleDisabled` component with link to settings                | ✅ Done |
| `confirm()` → `ConfirmationDialog` (menu, inventory, queue)     | ✅ Done |
| Notification Channels UI polished in account settings           | ✅ Done |
| Skeleton `loading.tsx` for Overview and Insights                | ✅ Done |
| `EmptyState` shared component; applied to menu management       | ✅ Done |
| `generateMetadata` + OpenGraph on `/reserve/[business]`         | ✅ Done |

---

## Non-Obvious Implementation Decisions

1. **WebSocket JWT auth via `/api/ws-token`**
   The JWT lives in an httpOnly cookie and is unreadable by JavaScript. The `useQueueSocket` hook calls the Next.js server route `/api/ws-token` to obtain a short-lived token, then passes it as `?token=` on the WebSocket URL. The FastAPI WS endpoint validates it with the same `jose.jwt.decode` used by `get_current_user`.

2. **`remove_by_token` returns `QueueEntry | None`**
   `queue_service.remove_by_token` returns the full `QueueEntry` on success (not `bool`) so the router can read `entry.name` and `entry.party_size` for the `queue_leave` notification body.

3. **Notification toast deduplication**
   `NotificationTrigger` uses `knownIdsRef` (a `useRef<Set<string>>`) to track which notification IDs have already been surfaced as Sonner toasts. The set is seeded when the panel opens so previously-seen notifications are never re-toasted on subsequent polls.

4. **Queue notification kinds**
   `queue_join`, `queue_leave`, `queue_called`, `queue_accepted` — all fan out to business staff. Staff-initiated actions (`queue_called`, `queue_accepted`) pass `exclude_user_id=current_user.id` so the acting user doesn't self-notify.

5. **Migration rename preamble (one-time)**
   Migrations 005 and 006 were renamed after being applied. The `_migrations` table was updated manually. If restoring from a backup that has the old names, run:

   ```sql
   UPDATE _migrations SET filename = '005_locations_and_module_flags.sql'
     WHERE filename = '005_phase0_foundation.sql';
   UPDATE _migrations SET filename = '006_onboarding_notifications_calendar.sql'
     WHERE filename = '006_phase1.sql';
   ```

6. **Item library copies, not links**
   Library items live in `item_library` (business-scoped). When "Add from Library" is used, the service copies the data into a new `menu_items` row — no FK back to the library. This is intentional: a live menu item must not silently change if a staff member edits the library template mid-service.

7. **`is_accepting_orders` blocks order placement at the API (503)**
   `PATCH /api/ordering/{business_id}/settings` toggles `businesses.is_accepting_orders`. The public `POST /api/ordering/{business_id}/orders` endpoint reads this flag and returns 503 if false. The customer menu page reads `GET /api/ordering/{business_id}/settings` (public, no auth) on load to show a banner and disable the cart checkout button client-side.

8. **Inventory `current_quantity` is denormalized**
   `inventory_items.current_quantity` is updated in-place on every `record_movement` call (not computed from `stock_movements` on read). `inventory_service.recompute_quantity_from_movements` provides a `SUM(quantity_delta)` helper for reconciliation/verification. `waste` movements always store a negative delta; the service negates the user-supplied value automatically.

9. **`alert_triggered` on `stock_movements`**
   When a movement causes `current_quantity < par_quantity`, the movement row's `alert_triggered` is set `true` and `notify_business_staff` fires with `kind="inventory_low_stock"`. The movement row itself serves as the audit record of when and why an alert was sent — no separate alerts table.

10. **`menu_item_ingredients` is now live (was a stub through Phase B.3)**
    The `menu_item_ingredients` join table (menu_item_id → inventory_item_id + `quantity`) was a dead FK scaffold until Phase B.4 wired it into real recipe data + auto-deduction. The `unit` column was dropped in migration 019 (quantity is now in the linked inventory item's native unit). See Non-Obvious #37 for the full unit-type/ml/deduction design.

11. **Event stream (Phase 4) — `publish()` is fire-and-forget**
    `publish(DomainEvent(...))` is always called _after_ `db.commit()`. Redis errors are caught and logged but never re-raised — a failed publish drops the WS push silently without crashing the HTTP response. The consumer (`stream_consumer.py`) runs as an asyncio background task in the FastAPI lifespan; it uses `XREADGROUP` with `ws_push` consumer group on stream `crowbar:events`. WS managers (`queue_ws_manager`, `order_ws_manager`) are unchanged — they still do the final `broadcast()`, but are now driven by the consumer rather than the router. `inventory.*` and `reservation.*` events flow through the stream but have no WS consumer yet (Phase 5).

12. **`ws_projections.py` extracted from routers**
    `broadcast_queue_state()` and `broadcast_order_board()` were private `_broadcast_*` helpers in the routers. They now live in `server/app/core/ws_projections.py` so the stream consumer can call them without importing the routers (which would create a circular dependency).

13. **`get_ordering_kpis` / `get_inventory_kpis` return `None`, not empty dict**
    Both functions return `None` (not `{}`) when no relevant data exists for the business — no orders in 30 days, or no inventory items at all. The frontend uses `None` as the gate to hide the Ordering/Inventory tabs on the Insights KPI section, rather than re-checking `enabled_modules`. The router already filters by enabled module before calling these functions, so `None` here means "module is enabled but has no data yet."

14. **`get_high_risk_reservations` uses raw `text()` — no ORM model for `ml_predictions`**
    The `ml_predictions` table is created by `002_ml_tables.sql` and written by the ML service's own SQLAlchemy session. The FastAPI backend has no ORM model for it. All queries against `ml_predictions` use `sqlalchemy.text()`. The query joins `ml_predictions` with `reservations` (ORM model) via raw SQL, filtering for `cancellation_probability > 0.6`.

15. **Overview uses a unified `OverviewCarousel` (3 slides) — no separate StaffingHintCard**
    The `StaffingHintCard` component and the old `InsightsCarousel` (2 slides: Q&A, Booking Page) were merged into a single `OverviewCarousel` component with 3 slides: (0) Staffing Forecast, (1) Q&A / Docs Chat, (2) Share Booking Page. Slide 0 renders a "Run pipeline" CTA when no forecast data exists, or a 3-day demand grid with busiest-day callout when forecast is available. The carousel auto-advances every 5 s, pauses on hover, and has dot navigation. The `segmentation` prop was removed from `BusinessOverviewClientProps` entirely — the overview no longer fetches segmentation.

16. **`hasModule()` lives in `client/lib/modules.ts`, not inline**
    The sidebar had a local `hasModule` closure using `meContext` from hook scope. It's now replaced with a shared `hasModule(enabledModules: string[], module: ModuleKey): boolean` in `client/lib/modules.ts`. The sidebar keeps a thin wrapper that defaults to showing all items while meContext loads (`!meContext || _hasModule(...)`). Server-side page.tsx guards import directly and call `hasModule(business.enabledModules ?? [], MODULE_KEYS.X)`.

17. **Module-disabled is enforced server-side in page.tsx, not client-side**
    Each module page.tsx already calls `fetchBusiness(user.businessId)`. A `hasModule` check after the fetch returns `<ModuleDisabled>` immediately — no client-side flicker, no layout shift. The `ModuleDisabled` component links to `/business/settings/modules` where owners can re-enable modules.

18. **`ConfirmationDialog` pattern for destructive actions**
    Props: `open: boolean`, `onOpenChange: (open: boolean) => void`, `onConfirm: () => void`, `variant?: "default" | "destructive"`. Do not use browser `confirm()`. Add a `useState<T | null>(null)` for the target item; set it to open the dialog, clear it in `onOpenChange`. The queue no-show, menu delete, and inventory delete all follow this pattern.

19. **Two error boundary layers**
    `client/app/business/error.tsx` (Next.js file convention) catches async server component and data-fetch errors. `DashboardErrorBoundary` (React class component in `client/components/dashboard-error-boundary.tsx`) wraps `<main>` in the layout and catches synchronous client render throws. Both are needed — `error.tsx` does not catch sync client errors; the class boundary does not catch async server errors.

20. **`loading.tsx` requires no page changes**
    Next.js automatically shows `loading.tsx` during server component data fetches for that route segment. No Suspense wrappers or refactoring of `Promise.all()` needed. Overview and Insights both benefit because they do multi-fetch `Promise.all()` calls that can take 1–3 s.

21. **Public routes resolve slug → UUID server-side (SSR pattern)**
    All public-facing pages under `/reserve/`, `/queue/`, `/menu/`, `/order/` receive a business slug in the URL param. The slug is resolved to a `Business` object (and UUID) in the server component (`page.tsx`) via `fetchBusinessBySlug(slug)` from `client/lib/api.ts`. The resolved `businessId` (UUID) and `businessSlug` are passed as props to the client component. Client components never pass the slug to API calls — only the UUID. `sessionStorage` keys and navigation links use `businessSlug` to keep URLs human-readable.
    - `clientGetMenu(businessId)`, `clientPlaceOrder(businessId, ...)`, `clientGetOrderStatus(businessId, ...)` all require UUID.
    - The backend enforces `business_id: UUID` type on all ordering/queue endpoints, returning 422 if a slug is passed.
    - `menu/[business]/page.tsx` and `order/[business]/page.tsx` were converted from `"use client"` pages to server components after this pattern was established, fixing a silent 422 bug on order placement.

22. **Sidebar groups map 1:1 to subscribable modules**
    Each `SidebarGroup` in `business-sidebar-content.tsx` corresponds to one module key and is wrapped in `{hasModule("module_name") && ...}`. The group label matches the module name. Group order: Overview, Reservations, Queue, Ordering, Inventory, Insights, Workspace. The "Workspace" group (Staff, Customers, Docs, Business, Settings) is always visible and is not module-gated. Queue uses the `ListOrdered` icon (not `Users`) to distinguish it from the Staff link. The Queue module entry in `modules-settings-client.tsx` also uses `ListOrdered` for icon consistency.

23. **Customers lives in Workspace; unifies reservation customers + queue walk-ins**
    The Customers tab is in the always-visible Workspace group (not gated on the `reservations` module). The backend endpoint `GET /api/customers/business/{id}/visitors` returns a unified `VisitorResponse` list that unions: (a) reservation customers (`users JOIN reservations`) and (b) queue walk-ins (`queue_entries WHERE status IN ('seated','removed')`). Deduplication is phone-based: if a walk-in's phone matches an existing reservation customer, the walk-in entry is suppressed. Walk-ins without a phone are always included as separate rows. The `VisitorResponse` shape (both Python Pydantic and TypeScript) carries: `id`, `name`, `phone`, `email`, `source` (`"reservation" | "walkin"`), `visit_count`, `last_visit`, `party_size`.

24. **`service_types` is the code name; "Booking Types" is the UI label**
    The table, model, API endpoints, and TypeScript types all use `service_types` / `ServiceType`. The UI renders the label "Booking Types" throughout (`business-types-client.tsx`, onboarding wizard, booking form). Fields `is_online`, `requires_payment`, `amount`, and `form_fields` were removed in migration 013 — bars/restaurants don't need payment-at-booking or custom intake forms for table/seat reservations.

25. **`routing_tag` on `menu_items` is a hardcoded enum (kitchen | bar | any) — to be replaced**
    The current `routing_tag` column drives which ticket board lane receives an order line item. The enum is intentionally hardcoded in Phase 2 as a placeholder. Phase 6 will replace it with a proper `stations` table (id, business_id, name, color) so businesses can define their own stations (e.g. "Grill", "Cold Drinks", "Desserts").

26. **`customers` is a separate identity from `users`; phone is the only unique key per business**
    `users` is staff/owner only — login accounts. `customers` (Phase 5.9) is the identity for everyone who interacts with a business without logging in: reservation guests, queue walk-ins (when phone is provided), and forthcoming WhatsApp/chatbot orderers. Dedup is `UNIQUE(business_id, phone) WHERE phone IS NOT NULL`. Email is a non-unique attribute. Phoneless flows (queue walk-up without phone, anonymous QR order) deliberately do NOT create a customer row — they keep using `session_token` and inline contact fields. Cross-channel collision (same human via two channels with different identifiers) is accepted as two rows by design, no merge UI.

27. **`customer_identity_service.upsert_customer` is the only correct way to write to `customers`**
    Every code path that wants to materialize a customer (reservation create, future order/queue paths in Phase B, future bot intake) calls `upsert_customer(db, business_id, phone, email, name)`. The service returns `None` for phoneless calls (no anonymous rows). On hit, it preserves existing name/email and only overwrites with new non-empty values. Never insert into `customers` directly — the upsert is the contract.

28. **`channel` is a free-string column (`varchar(16)`) on orders / reservations / queue_entries**
    Allowed values: `qr | whatsapp | chatbot | web | staff`. No DB CHECK constraint yet (added in Phase B once all routers populate it consistently). For reservations created today, `reservation_service` always stamps `channel="web"`.

29. **No deferred cutovers — single-pass migrations**
    When changing a data shape (e.g. retargeting a FK), land the schema change, code refactor, and old-state cleanup in one phase. Phase 5.9 demonstrates the pattern: migration 014 adds the new column nullable, migration 015 (next file) copies/promotes/drops the old. No `customer_id_new` parallel state remains in code or DB. Old `users.user_type='customer'` rows were dropped in 015 rather than left as "Phase H cleanup."

30. **Reservation SMS reminders run on Celery beat, not the request path**
    `celery_app.py` defines an hourly beat task `send_reservation_reminders` that scans for reservations ~24h out and sends an SMS via `sms_service.send_sms`. Dedup is enforced by the `reservations.sms_reminder_sent` boolean (migration 011) so a worker restart never double-sends. Celery uses Redis as both broker and result backend. The worker and beat are separate processes — both must run for reminders to fire. `dev.sh` does **not** start them; run them manually when testing reminders.

31. **Mock/demo mode swaps the entire API layer at import time**
    When `NEXT_PUBLIC_USE_MOCK_API=true`, the frontend uses `client/lib/api-mock.ts` (backed by `mock-data.ts`) instead of hitting the backend. Authenticated endpoints return `null` (no session); public reads return static data. This exists so the app can be deployed to Vercel and demoed before the FastAPI backend is live. `mock-data.ts` mirrors the seed data and uses relative dates so the data always looks current.

32. **One seed file; `001_seed_puzzles.sql` is the rich demo tenant ("Puzzles Bar")**
    `SEED_DATA=true` loads the single seed file `001_seed_puzzles.sql`. Puzzles Bar is a craft-cocktail-bar tenant that exercises every module (reservations, queue, ordering, inventory, insights) and is the canonical dataset for demos and the mock layer. (There was previously a `001_seed.sql` that seeded a legacy "RK Design" consultancy business; it was emptied to comments-only in the bars-only refocus, then deleted here — a comment-only file crashed `asyncpg.execute()` with `EmptyQueryResponse` → `'NoneType' has no attribute 'decode'` at dev startup. The former `002_seed_puzzles.sql` was renamed to `001_seed_puzzles.sql` so a single seed file remains.)

33. **Customer-portal remnants fully removed**
    Phase 5.8 removed the `/customer/` routes and backend endpoints; the leftover dead components (`customer-sidebar.tsx`, `customer-sidebar-content.tsx`, `customer-floating-content.tsx`) and empty dirs (`client/app/business/people/`, `client/app/business/reservation-types/`) have now also been deleted. No customer-portal code remains. The active landing page uses `landing-navbar.tsx` + `pricing-modal.tsx` (pricing is a modal, not the removed `/pricing` page).

34. **Tabs are additive; tab total is computed on demand, settlement is simulated**
    A `tab` groups multiple discrete orders under one running total (Phase B.1). Orders with `tab_id = NULL` behave exactly as before — tabs replace nothing. `add_order_to_tab` is a thin wrapper over `order_service.place_order` that then stamps `tab_id` (no duplicated order-creation logic), and it publishes `order.placed` so tab orders still flow through the existing ticket board unchanged. The tab total is **never denormalized**: `tab_service.get_tab_total` is a live `SUM(orders.total_amount)` over the tab's **non-cancelled** orders (compute-on-demand, like `inventory_service.recompute_quantity_from_movements`). The `cancelled` exclusion is real, not defensive — `cancelled` is a genuine `orders.status` value (see the order-lifecycle note in Phase 2) reachable via the status-transition endpoint and enforced by a CHECK constraint in migration 008; a cancelled order must not count toward what's owed. Closing a tab is a status change + a `settled_method` (`cash|card|comp|other`) value — there is **no payment processing** behind it (deferred to Phase 10). `settled_method` is required to close. Closing an **already-closed** tab is rejected with **409** (router checks `status != "open"` before mutating, mirroring the add-order-to-closed-tab guard) so a double-click or retried request can't silently overwrite the original settlement record. The `/api/tabs*` router scopes tenancy via `get_current_business` (no `business_id` in the path), matching the core tenant-scoping convention rather than the ordering router's path-param style.

35. **Happy hour is timezone-aware and decided by ONE server-side function; day-of-week has a single canonical enum (Monday=0)**
    `happy_hour_service.is_happy_hour_active(db, business_id, at=None)` is the **single source of truth** for "is a happy-hour window active right now." It reads `businesses.timezone` (an IANA name), converts `at` (default `now()` in UTC) into that timezone with Python `zoneinfo`, then matches `local.weekday()` and `local.time()` against every `is_active` window. It is called in **exactly two places**, and they must stay identical so displayed and charged prices can't disagree: (a) the **public menu read** (`GET /api/ordering/{id}/menu`) stamps a transient `menu.happy_hour_active` bool that `MenuResponse` serializes — items carry their own `happy_hour_price`, so the client renders the discount from server-decided state, never from a local clock; (b) **order placement** (`order_service.place_order`) computes `hh_active` once and charges `item.happy_hour_price` (when set and active) instead of `item.price`. A window applies **business-wide**; an item opts in only by having a non-NULL `happy_hour_price` (flat override, not a percentage). `happy_hour_price` on `MenuItemUpdate` uses a **`model_fields_set`** check (not `is not None`) so a client can *clear* the discount by sending `null` while omission leaves it unchanged. **Day-of-week is standardized to one convention everywhere: 0=Monday..6=Sunday** — this matches Python `datetime.weekday()` so no offset math is ever needed. The single source is `server/app/constants/days.py` (backend) mirrored by `client/lib/days.ts` (frontend); both `analytics_service`, the onboarding wizard, the operating-hours settings, and the happy-hour day picker consume it. JS `Date.getDay()` (0=Sunday) must be converted via `jsDayToIndex()` before use. **Overnight windows are supported:** a window with `start_time <= end_time` is same-day (matches when the local weekday is listed and `start_time <= t <= end_time`); a window with `start_time > end_time` wraps past midnight and is active in two segments — on a listed day from `start_time` until midnight, and on the day *after* a listed day from midnight until `end_time` (keyed off `prev_weekday = (weekday - 1) % 7`). So a Friday 22:00–02:00 window is active Fri 22:00–23:59:59 **and** Sat 00:00–02:00, even though only Friday is listed in `days_of_week`. The staff create form allows `start > end`; it only rejects an identical start/end (a zero-length window).

36. **Age verification is self-attestation only, and the backend is authoritative — the checkbox is a formality, the staff glance is the real check**
    This is a speed bump plus a visual cue, **not** identity verification: no ID scan, no third-party service, no stored proof of age. `menu_items.is_alcoholic` flags an item. "Does this order contain alcohol" is **never stored** — it is derived on demand by `order_service.order_contains_alcohol(items)` (the single source of truth; accepts resolved `MenuItem` rows at placement or stored `OrderLineItem` rows at read, both carrying `is_alcoholic`). Order line items **snapshot** `is_alcoholic` at placement (like `routing_tag`/`unit_price`), so the staff alcohol badge survives later menu edits or item deletion (`item_id` is nullable). The attestation itself **is** persisted, but only as `orders.age_confirmed` on the order row — no session-level "already confirmed, skip next time" logic. **The backend re-validates, never trusting a client "box checked" flag:** `place_order` computes `order_contains_alcohol` from the resolved items and, when `require_age_confirmation` is set and the cart is alcoholic, raises `AgeConfirmationRequired` (→ 422) unless `request.age_confirmed` is true. **Channel scoping is structural, not a stored `channel` string:** the public order endpoint (customer self-service) calls `place_order` with the default `require_age_confirmation=True`; the tabs path (`tab_service.add_order_to_tab`, staff entering an order in person) passes `require_age_confirmation=False`. Those are the only two callers of `place_order`, so gating at the call site cleanly separates customer from staff without populating/reading `orders.channel`. **`businesses.legal_drinking_age` (default 18) is read for the checkout copy — no age is hardcoded** in logic or copy (different countries: 18 EU/Turkey, 21 US); it is editable on the Business Info settings page. The public order page pulls it from the resolved business and passes it to the checkout attestation ("I am at least N years old"). Frontend gates the Place Order button on the checkbox; the 422 is the safety net. **Deliberately NOT touched:** the item library carries no alcohol flag; only checkout/placement is gated (menu browsing is open); reservations/booking are unaffected.

37. **Pour/keg inventory is ml-canonical, and bottle & keg share identical math — the unit_type only picks UI presets; recipe deduction is best-effort and never blocks a status transition**
    `inventory_items.unit_type ∈ {each, bottle, keg}`. **`each` is the unchanged legacy behavior** (countable garnishes, napkins) — zero behavior change, fully backward compatible. **`bottle` and `keg` are the same underlying thing**: a liquid whose `current_quantity`, `par_quantity`, and recipe quantities are all stored and computed in **milliliters (ml)**. There is no fractional-bottle-count storage. `bottle` vs `keg` differ **only** in which container-size presets the frontend offers (`client/lib/units.ts`) — the DB and service math are byte-identical, so never special-case one vs the other. `container_volume_ml` is the ml capacity of one container; a container-count receipt (`StockMovementCreate.container_quantity`, receive-only) is converted to a ml delta server-side in `inventory_service.record_movement` (`container_quantity * container_volume_ml`), reusing the one `apply_movement` core — the movement row always stores the ml delta. **Recipe quantity is in the LINKED item's native unit** (ml for bottle/keg, count for `each`), so a cocktail's rum pour and its lime-wedge garnish coexist in one recipe; the deduction is `quantity * line_item.quantity` regardless of unit. The oz/ml toggle in the recipe builder is a **pure frontend convenience** — everything converts to ml before it leaves the client (`ozToMl`); the backend only ever sees the native unit. **Deduction fires once, on the `served` transition** (`order_service.advance_order_status` → `recipe_service.deduct_for_served_order`), writing `movement_type='sale'` rows via the shared `apply_movement`. It is **best-effort and non-blocking by design**: a missing recipe, a missing/deleted inventory item, or a negative result is logged and swallowed — a bar running out mid-service is expected, not an error, so it must never fail the status change (`served` is terminal, so no double-deduction risk). Par breaches from a `sale` still fire the existing `inventory_low_stock` notification (reused, not rebuilt). When an ingredient hits **`<= 0`, every menu item requiring it is auto-disabled** (`is_available=False`); **re-enable is manual** (decided up front — a single `is_available` flag can't distinguish an auto-disable from a staff 86, so auto-restore would clobber deliberate disables; manual re-enable is the safe choice). The menu-management **low-stock badge** reuses the same par check (`recipe_service.get_menu_item_stock_info`, which also returns the servings-remaining count — see Non-Obvious #44), surfaced at the menu-item level. **Only two callers write `menu_item_ingredients`** (the recipe GET/PUT replace-all endpoints); the `'sale'` movement type is **system-generated only** — `StockMovementCreate` still rejects it (`^(receive|adjust|waste)$`). **Guarded mutation risk:** because `quantity` is native-unit, changing an item's `unit_type` across the **count↔ml boundary** (`each` ↔ `bottle`/`keg`) after a recipe references it would silently reinterpret that number (a `44` meaning "44 ml" becomes "44 units"). `inventory_service.update_item` blocks exactly that transition with a **409** (`UnitTypeChangeBlocked`) while any `menu_item_ingredients` row references the item — the staff must edit/remove the recipe reference first (no auto-reassign UI). `bottle` ↔ `keg` is **exempt** (identical ml math), and an item with no recipe references changes freely; the 409 detail surfaces in the inventory-edit form toast. This guards future edits only — no retroactive check on existing rows. **Out of scope (deferred):** waste/line-cleaning/pour-variance (Tier C), per-keg-instance tracking (inventory stays pooled), reorder suggestions (Phase 9).

38. **The tab add-order compose UI reuses the public ordering logic + the standard placement path — it never re-implements pricing or age rules**
    The "Add order" action on an open tab (`client/app/business/tabs/tab-order-compose.tsx`) is a staff-facing menu/cart dialog, not a parallel ordering implementation. The cart math (modifier toggle with per-group `maxSelect` eviction, happy-hour `effectivePrice`, line/cart totals, identical-line merge) lives in `client/lib/cart.ts` and is shared with the public `menu-client.tsx` (which was refactored to consume it). It reads the menu via the **public** `clientGetMenu` (same endpoint the customer menu uses), so `menu.happyHourActive` is the server-decided happy-hour state — the compose UI renders discounts from that, never a local clock. Submission goes through `clientAddOrderToTab` → `POST /api/tabs/{id}/orders` → `tab_service.add_order_to_tab` → `order_service.place_order` — the **one** standard placement path — so **happy-hour pricing is charged server-side** and **age verification is correctly skipped** (the tabs path passes `require_age_confirmation=False`; see Non-Obvious #36). Consequences that are easy to get wrong if you diverge from this: the compose UI has **no age-attestation checkbox** (staff channel) and **no customer contact step**, and it must **not** compute or send its own prices — it only sends item ids + quantities + modifiers, and the server prices them. After a successful add, the parent (`tabs-client.tsx`) re-fetches the tab (`clientGetTab`) so the running total + order list refresh automatically — the user never needs the manual refresh button to see their own just-added order. **Deferred:** table selection / party size on the compose UI (the endpoint accepts `table_identifier` but the UI doesn't collect it yet), split/guest attribution, real payment.

39. **Tabs are NOT wired into the WebSocket/event-stream infra — the tab detail view is refresh-driven, and this is an intentional known gap**
    Unlike the queue live board and the order ticket board, the tab detail view (`tabs-client.tsx`) has **no live updates**. There is no `tab.*` domain event, no tab entry in `stream_consumer.py`'s dispatch (it only routes `queue.*` → `broadcast_queue_state` and `order.*` → `broadcast_order_board`), no tab projection in `ws_projections.py`, and no tab WS manager/endpoint. The **only** `publish()` on the tab path is the `order.placed` emitted by `POST /api/tabs/{id}/orders` — and that exists solely so tab orders show up on the **ticket board**, not to update the tab total/list. Consequences: the tab total + order list stay stale until something re-fetches the tab. Two things re-fetch: (a) the manual **refresh button** on the tab detail, and (b) the client-side **auto-refetch after the compose UI adds an order** (Non-Obvious #38) — both are plain `clientGetTab` HTTP reads, **not** live pushes. So if a *second* staff member adds/cancels an order on the same tab, the first member won't see it until they refresh. Making tabs live (a `tab.updated` event + a tab projection/WS channel) is a **real feature**, not a small fix, and is deliberately **not** built. Do not "fix" the refresh button by assuming WS is missing by accident — it's a scoped-out gap.

40. **Order status transitions are bidirectional (previous-step only), and moving backward out of `served` reverses the inventory deduction from ACTUAL recorded movements — never a recipe recompute**
    `order_service._TRANSITIONS` now allows a one-step **backward** move alongside each forward advance: `preparing→received`, `ready→preparing`, `served→ready` (forward advances unchanged; `cancelled` stays a terminal side-exit — no un-cancel). Backward exists to correct an accidental click. **Any staff member with ticket-board access can move any ticket in either direction — there is no permission gate** (that depends on Phase 7 RBAC, which doesn't exist yet). The **only** transition with an inventory side effect is the `served` boundary, exactly as when deduction was first scoped: entering `served` deducts (`recipe_service.deduct_for_served_order`), leaving `served` credits back (`recipe_service.reverse_deduction_for_order`). The reversal is **precise by construction, not recomputed**: it sums *this order's own* real `stock_movements` rows — `'sale'` (negative) and `'sale_reversal'` (positive) — grouped per inventory item, and credits back only the still-outstanding net. This is why `stock_movements.order_id` had to be added (migration 020): before it, a `'sale'` movement had **no** machine-readable link to its order (only a free-text note), so "the movements for order X" wasn't queryable. Summing actual movements (a) reverses exactly what was deducted even if the recipe changed since serving, and (b) makes repeated serve/un-serve/serve cycles net out correctly and makes a redundant reversal a no-op (idempotent). Like the forward deduction, the reversal is **best-effort / non-blocking** — a missing item or any error is logged and swallowed so it never fails the status change. **Auto-disabled menu items are deliberately NOT re-enabled on reversal** (manual re-enable policy — a single `is_available` flag can't distinguish an auto-disable from a staff 86; consistent with Non-Obvious #37). `'sale_reversal'` is **system-generated only** — `StockMovementCreate` still rejects it (regex `^(receive|adjust|waste)$`).

41. **`order_status_timeline` IS the status audit log (extended, not a new table) — and it is NOT the planned Phase 10 audit-log system**
    The ticket-board work needed a per-transition audit trail. Rather than add the handoff's proposed parallel `order_status_history` table, migration 020 **extends the existing `order_status_timeline`** — it was already appended from the one transition handler (`advance_order_status`) and already serialized to customers on `OrderResponse.status_timeline`, so a second near-identical table would have been pure duplication. The only add is a nullable `from_status`, so each row now records from→to. Rows: the initial `received` written at placement has `from_status=NULL` + `changed_by=NULL` (a creation, not a transition); every real transition (forward **or** backward) records both `from_status` and the acting `changed_by` (the router passes `current_user.id`). One append point only — the same handler modified for Non-Obvious #40 — so there is no second write path. `order_to_dict` now includes `status_timeline` too, so the live WS board carries history (not just the initial HTTP fetch). This is **data capture only**; the staff ticket has a small expandable "History" list, but there is **no export/filter/cross-entity viewer**. It is explicitly **not** the Phase 10 "audit log exports" system (broader scope, export formats, cross-entity, sequenced after RBAC) — do not build toward that here.

42. **`waste` movements carry a structured `reason` enum (not just free-text) so waste is aggregatable later — the reason is captured now, the analytics is Phase 9**
    Manual inventory correction was already delta-based via the Phase 3 "Record Movement" dialog (`receive`/`adjust`/`waste`; waste enters a positive amount that is deducted; `adjust` is signed). Two things were added, no absolute "set to X" path (deliberately rejected — delta only). **(a) A structured `waste` reason:** `stock_movements.reason VARCHAR(20)` ∈ `{spillage, wrong_measure, breakage, spoilage, other}`, guarded by a CHECK-IN constraint modeled on `movement_type` (migration 021 — a VARCHAR+CHECK, **not** a lookup table, following the existing small-enum convention). It exists specifically so waste can be grouped by cause later ("how much do we typically waste per bottle / per drink") — a **Phase 9 ML V2** motivation; **no analytics/reporting UI consumes it yet, and none was built here** (data capture only). Free-text detail keeps using the **existing `notes` column** — no separate `note` column was added. `reason` is **required for `waste`** (enforced in `StockMovementCreate._one_quantity` + the frontend defaults it to `spillage`), **optional for `adjust`**, and **rejected for `receive`**; the DB CHECK only validates the value domain (nullable — older waste rows and all non-waste movements are NULL). It threads through `inventory_service.apply_movement(reason=...)` → `record_movement`, so the automatic `'sale'`/`'sale_reversal'` recipe path (which never passes a reason) is untouched. **(b) The recipe builder's ml/oz toggle is reused, not rebuilt:** for a liquid (`bottle`/`keg`) item the waste/adjust quantity input gets the same ml/oz `Select` + `toggleMovementUnit` (mirrors `menu-management-client`'s `toggleRowUnit` — converts the shown value on switch, converts oz→ml via `ozToMl` before send, since the backend only ever stores ml). `each` items stay a plain count; the pre-existing container/ml "Enter as" receive toggle is unchanged and exempt from ml/oz. **Deliberately NOT done:** the demo seed's waste rows (`001_seed_puzzles.sql`) model "weekly usage" consumption, which doesn't cleanly map to a loss cause, so they were left `reason = NULL` (they legitimately exercise the nullable/legacy path); tag them only if a cleaner demo dataset is wanted.

43. **All `Decimal` API fields serialize as JSON numbers globally (`AppBaseModel`), and the frontend coerces them through one `toMoney()` helper — this closes the root cause of the earlier `toFixed` crash, not just the two mappers first implicated**
    Pydantic v2 serializes a `Decimal` field to a JSON **string** (`"12.50"`), but every frontend TS type declares these as `number`. So any money/`Decimal` value that reached a mapper which *cast* (`x as number`) rather than *coerced* (`Number(x)`) arrived as a string and blew up on `.toFixed()` / arithmetic. This was systemic (many `Decimal` fields across `order`, `menu`, `inventory`, `tab`, `recipe` schemas), not the two order mappers (`toOrder`, `toOrderFromWS`) originally blamed. **Fixed at the source, once, centrally:** `server/app/schemas/base.py` defines `AppBaseModel(BaseModel)` — it sets `from_attributes=True` (replacing the per-schema `model_config = {"from_attributes": True}`) **and** carries a `@model_serializer(mode="wrap")` that, in JSON mode only, rewrites every `Decimal`-valued field on the model to `float`. **Every** schema class inherits it (wired project-wide, not per-field), so any *future* `Decimal` field is covered automatically with no annotation. Mechanism detail: in JSON mode the wrap handler has already stringified Decimals, so the serializer finds them by inspecting the model's own field *values* (`getattr(self, name)` is a `Decimal`) and overwrites the corresponding output key — nested models / list items each run their own serializer, so only direct fields are handled per model. Python-mode `model_dump()` keeps `Decimal` intact for internal/service use. Verified with **live requests** (not just code): `/api/ordering/{id}/menu` (`price`, `happy_hour_price`), `/api/ordering/{id}/orders` (`total_amount`, `unit_price`), `/api/tabs` (`total`), `/api/inventory/{id}/items` (`current_quantity`, `par_quantity`, `cost_per_unit`, `container_volume_ml`) and movements (`quantity_delta`) all return bare numbers. **Defense-in-depth on the frontend:** `client/lib/money.ts` exports `toMoney()` (required → `number`, non-finite → `0`) and `toOptionalMoney()` (nullable → `number | undefined`); **all** mappers that read a `Decimal`-origin field route through them (`toOrder`, `toOrderFromWS`, `toTab`, `toModifier`, `toMenuItem`, `toLibraryItem`, `toInventoryItem`, `toStockMovement`, `toRecipeIngredient`) instead of scattering their own `Number(...)`/`as number`. So even if some future value arrived as a string off a path that bypasses `AppBaseModel`, there's one place that gets the coercion right. (Integer count fields like analytics `total_waiting`/`total_movements` are plain `int`, not `Decimal` — left as-is.)

44. **Two different "how much is left" numbers, computed live and never stored, deliberately distinct — recipe-exact menu-item servings (Part 1) vs a rough per-bottle pours estimate (Part 2) — and the servings number is NOT independent per menu item**
    Both are staff-facing only (no public-menu exposure — see "Future — Public-Facing Servings/Pours Display") and both follow the compute-on-demand rule (like `is_happy_hour_active` and the tab total): **no count column exists for either.**
    **(a) Menu-item "servings remaining" (recipe-exact).** For a menu item with a populated recipe (`menu_item_ingredients`), servings = `min` over each linked ingredient of `floor(inventory_item.current_quantity / recipe_quantity)` — the most-constrained ingredient caps it. Computed server-side in `recipe_service.get_menu_item_stock_info(db, business_id)` (which **replaced** `get_low_stock_menu_item_ids`, returning per-menu-item `{has_low_stock_ingredient, servings_remaining}` in one pass so the badge query does both jobs). Items **without** a recipe are omitted entirely — the UI shows nothing, **never a fabricated `0`** (same rule the low-stock badge already followed). This is **recipe-exact given current stock**, so it's labeled plainly "~N servings left" — **not** an estimate/approximation. Surfaced on the menu-management item cards (`menu-management-client.tsx`) as a **separate neutral (slate) badge next to** the existing amber low-stock badge — deliberately **not** folded into that badge, because low-stock is a below-**par** threshold warning while servings-remaining is an absolute count; a drink can have 40 servings left yet still sit below par (par is a reorder line, not zero). The endpoint (`GET /api/ordering/{id}/menu-item-stock-flags`, response now `list[MenuItemStockFlag]` with `servings_remaining`) and its client (`clientGetMenuItemStockFlags` → `MenuItemStockInfo[]`) were widened from the old id-only `list[UUID]`. **Crucial non-independence:** this number is **NOT** per-menu-item-independent — two cocktails sharing an ingredient (e.g. two tequila drinks) **both** drop when **either** one sells, because they draw from the same pooled inventory. This is expected behavior, not a bug; documented here so it isn't "discovered" later and treated as one.
    **(b) Bottle/keg "pours remaining" (rough estimate).** An **optional** `inventory_items.default_pour_ml` (migration 022, nullable, no default) is a **generic reference pour independent of any recipe**; when set, pours = `floor(current_quantity / default_pour_ml)`, computed **live client-side** in the inventory list (`inventory-management-client.tsx`) — no backend endpoint (both operands are already on the item). **Unset ⇒ no estimate shown at all** (never a fabricated fallback). Because it's a generic size (not what a specific recipe pours), it's labeled **"~N pours left (est.)"** — the "(est.)" is the deliberate visual/textual distinction from Part 1's recipe-exact number (the two live on different pages — menu vs inventory — so they never sit literally adjacent, but the copy keeps them tellable apart at a glance). Entry UI: an optional "Default pour size" field shown only for `bottle`/`keg`, reusing the existing ml/oz toggle + a presets dropdown (`POUR_PRESETS` in `client/lib/units.ts`: 1/1.5/2 oz + 25/50 ml, each a canonical `(value, unit)` pair so a preset sets both input and toggle) — same free-entry-with-presets pattern as `container_volume_ml`. Stored/sent in **ml** (oz converted via `ozToMl` before send, like the recipe builder and the waste ml/oz toggle); cleared by sending `null` (handled via `model_fields_set` in `inventory_service.update_item`, mirroring `container_volume_ml`). Seed (`001_seed_puzzles.sql`) sets `default_pour_ml` on the three ml-tracked demo liquids so the estimate is demoable. **Out of scope (deferred):** surfacing either number on the public menu (its own future section, needs product/copy decisions), and per-item pour-variance tracking (Tier C).

---

## Key Files

| File                                                                     | Purpose                                                                                                                                        |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/app/dependencies.py`                                             | `get_current_user`, `get_current_business`, `require_module`                                                                                   |
| `server/app/schemas/base.py`                                             | `AppBaseModel` — shared base for all schemas; `from_attributes=True` + global `Decimal`→JSON-number serialization (Non-Obvious #43)             |
| `client/lib/money.ts`                                                    | `toMoney()` / `toOptionalMoney()` — canonical coercion of backend `Decimal` fields to `number`, used by every money-touching mapper (#43)       |
| `server/app/services/notification_service.py`                            | In-app + SMS + email dispatch                                                                                                                  |
| `server/app/services/queue_service.py`                                   | Queue join/call/seat/remove logic                                                                                                              |
| `server/app/services/queue_ws_manager.py`                                | In-memory WebSocket connection manager                                                                                                         |
| `server/app/routers/queue.py`                                            | Queue REST + WebSocket endpoints                                                                                                               |
| `server/app/services/customer_service.py`                                | `get_all_visitors()` — union of reservation customers + queue walk-ins (now joins via `Customer.id`, post-Phase-5.9)                           |
| `server/app/services/customer_identity_service.py`                       | `upsert_customer(business_id, phone, email, name)` — phone-keyed upsert; the only correct way to write to `customers`                          |
| `server/app/models/customer.py`                                          | `Customer` ORM model (Phase 5.9 identity for unauthenticated humans)                                                                           |
| `server/app/models/table.py`                                             | `Table` ORM model (per-table QR ordering, Phase 5.9 stub for Phase B/C wiring)                                                                 |
| `server/app/models/bot_config.py`                                        | `BotConfig` ORM model — per-business per-channel bot settings (Phase 5.9 stub)                                                                 |
| `server/app/schemas/customer.py`                                         | `CustomerResponse` Pydantic schema                                                                                                             |
| `server/app/routers/customers.py`                                        | Customer endpoints: `GET /business/{id}` (Customer rows), `GET /business/{id}/visitors` (unified), `GET /business/{id}/{customer_id}` (single) |
| `client/lib/client-api.ts`                                               | All frontend API calls (auth + public)                                                                                                         |
| `client/hooks/use-queue-socket.ts`                                       | WebSocket hook (fetches token from `/api/ws-token`)                                                                                            |
| `client/app/api/ws-token/route.ts`                                       | Server route: reads httpOnly cookie, returns JWT for WS auth                                                                                   |
| `client/components/notification-trigger.tsx`                             | Bell icon + notification panel + toast deduplication                                                                                           |
| `server/app/routers/ordering.py`                                         | Ordering REST + WebSocket endpoints                                                                                                            |
| `server/app/models/tab.py`                                               | `Tab` ORM model (open/closed; opened_by/closed_by; settled_method)                                                                             |
| `server/app/schemas/tab.py`                                              | `TabOpenRequest`, `TabCloseRequest`, `TabResponse` (carries computed `total` + `orders`)                                                       |
| `server/app/services/tab_service.py`                                     | `open_tab`, `add_order_to_tab` (wraps `order_service.place_order`), `get_tab_total` (live SUM), `close_tab`                                    |
| `server/app/routers/tabs.py`                                             | Tab endpoints `/api/tabs*` — behind `require_module("ordering")`, tenant-scoped via `get_current_business`                                     |
| `client/app/business/tabs/tabs-client.tsx`                               | Tabs UI: open a tab, view associated orders + running total, close via settlement dialog, "Add order" → compose dialog + auto-refresh          |
| `client/app/business/tabs/tab-order-compose.tsx`                         | Staff add-order-to-tab compose dialog (menu/cart) → `clientAddOrderToTab`; reuses `lib/cart.ts` + the standard placement path (Non-Obvious #38) |
| `client/lib/cart.ts`                                                     | Shared cart logic (CartItem + modifier toggle, happy-hour `effectivePrice`, line/cart totals, merge) — used by public menu + tab compose UI     |
| `server/app/constants/days.py`                                           | Canonical day-of-week enum (0=Monday..6=Sunday, matches `datetime.weekday()`); `DAY_NAMES`, `DAY_ABBREVIATIONS`, `weekday_index()`             |
| `client/lib/days.ts`                                                     | Frontend mirror of `constants/days.py` (identical indices) + `jsDayToIndex()`; single source of day ordering (onboarding, hours, happy hour)   |
| `server/app/models/happy_hour_window.py`                                 | `HappyHourWindow` ORM model (business-wide window; `days_of_week` INT[], wall-clock `start_time`/`end_time`)                                    |
| `server/app/services/happy_hour_service.py`                              | `is_happy_hour_active()` (single source of truth) + window CRUD; timezone-aware via `zoneinfo` + `businesses.timezone`                          |
| `server/app/schemas/happy_hour.py`                                       | `HappyHourWindowCreate/Update/Response` (validates day indices 0..6)                                                                           |
| `server/app/routers/happy_hour.py`                                       | Happy hour window endpoints `/api/happy-hour/windows*` — behind `require_module("ordering")`, tenant-scoped via `get_current_business`         |
| `client/components/timezone-combobox.tsx`                                | Searchable IANA-timezone combobox (Popover + Command + `Intl.supportedValuesOf`); used by onboarding + Business Info                           |
| `client/app/business/happy-hour/happy-hour-settings-client.tsx`          | Happy hour window CRUD UI (name, day picker, start/end time, active toggle); shows the business timezone next to the time inputs                |
| `server/app/services/menu_service.py`                                    | Menu/category/item/modifier CRUD                                                                                                               |
| `server/app/services/order_service.py`                                   | Order placement (idempotent), status transitions                                                                                               |
| `server/app/services/order_ws_manager.py`                                | In-memory WebSocket manager for orders                                                                                                         |
| `client/hooks/use-order-socket.ts`                                       | WebSocket hook for live ticket board                                                                                                           |
| `server/app/services/inventory_service.py`                               | Inventory CRUD, movement logic, par breach → notification; `apply_movement` (schema-free core reused by recipe `sale` deductions); container→ml receive conversion |
| `server/app/routers/inventory.py`                                        | Inventory REST endpoints (all behind `require_module("inventory")`)                                                                            |
| `server/app/models/recipe.py`                                            | `MenuItemIngredient` ORM model (recipe line; `quantity` in the linked item's native unit)                                                       |
| `server/app/services/recipe_service.py`                                  | Recipe get/set (replace-all), `deduct_for_served_order` (best-effort, non-blocking + auto-disable on ≤0), `get_menu_item_stock_info` (low-stock flag + live recipe-exact servings-remaining, #44) |
| `server/app/schemas/recipe.py`                                           | `RecipeIngredientInput/Response`, `RecipeSetRequest`, `MenuItemStockFlag`                                                                       |
| `client/lib/units.ts`                                                    | Unit-type helpers: container-volume presets (bottle/keg, US+metric), ml⇄oz conversion, `isLiquidUnitType`                                       |
| `client/app/business/inventory/inventory-management-client.tsx`          | Inventory dashboard UI                                                                                                                         |
| `server/app/core/events.py`                                              | `DomainEvent` class + `publish()` → writes to Redis Stream `crowbar:events`                                                                    |
| `server/app/core/redis_client.py`                                        | Async Redis singleton (`redis.asyncio`)                                                                                                        |
| `server/app/core/stream_consumer.py`                                     | asyncio consumer: `XREADGROUP` → dispatch → `XACK`; retry up to 3×                                                                             |
| `server/app/core/ws_projections.py`                                      | `broadcast_queue_state()` + `broadcast_order_board()` (called by consumer)                                                                     |
| `server/app/services/analytics_service.py`                               | Dashboard stats + Phase 5 KPI functions + high-risk reservation query                                                                          |
| `server/app/routers/analytics.py`                                        | Analytics endpoints incl. `/kpis` and `/high-risk` (insights-gated)                                                                            |
| `client/app/business/insights/insights-client.tsx`                       | Insights dashboard: ML sections + OperationalKpisSection + high-risk list                                                                      |
| `client/app/business/overview/business-overview-client.tsx`              | Overview dashboard; `OverviewCarousel` (3 slides: staffing forecast, Q&A, booking link)                                                        |
| `client/app/menu/[business]/page.tsx`                                    | Public menu page — SSR slug→UUID resolution, renders `MenuClient`                                                                              |
| `client/app/menu/[business]/menu-client.tsx`                             | Menu UI: categories, items, cart, item detail sheet                                                                                            |
| `client/app/order/[business]/page.tsx`                                   | Public order/cart page — SSR slug→UUID resolution, renders `OrderClient`                                                                       |
| `client/app/order/[business]/order-client.tsx`                           | Cart view + order placement + post-order status polling                                                                                        |
| `client/middleware.ts`                                                   | Public route declarations                                                                                                                      |
| `client/lib/modules.ts`                                                  | `hasModule()` utility + `MODULE_KEYS` constants (shared by sidebar, page guards, settings)                                                     |
| `client/components/module-disabled.tsx`                                  | Locked-module fallback card with link to `/business/settings/modules`                                                                          |
| `client/components/dashboard-error-boundary.tsx`                         | React class ErrorBoundary wrapping dashboard `<main>`                                                                                          |
| `client/components/empty-state.tsx`                                      | Shared empty state component (icon, title, description, optional action button)                                                                |
| `client/components/confirmation-dialog.tsx`                              | Reusable destructive-action dialog (`open`, `onOpenChange`, `onConfirm`, `variant`)                                                            |
| `client/app/business/settings/modules/`                                  | Module enable/disable settings page (uses `clientUpdateEnabledModules` + `router.refresh()`)                                                   |
| `client/app/business/overview/loading.tsx`                               | Skeleton loading screen for Overview (shown during server-side fetch)                                                                          |
| `client/app/business/insights/loading.tsx`                               | Skeleton loading screen for Insights (shown during server-side fetch)                                                                          |
| `client/app/business/profile/types/business-types-client.tsx`            | "Booking Types" CRUD UI (maps to `service_types` backend); name/capacity/duration/color/isPendingEnabled                                       |
| `client/app/business/orders/ticket-board-client.tsx`                     | Live ticket board: status columns (received/preparing/ready/served) as the primary axis, All/Kitchen/Bar station **filter**, forward + one-step-back move controls, per-ticket history; WebSocket-driven |
| `client/components/reservation-form.tsx`                                 | Public multi-step booking form: type → datetime → contact info → confirmation/success                                                          |
| `server/app/celery_app.py`                                               | Celery app + beat schedule; `send_reservation_reminders` task (hourly, 24h-out SMS)                                                            |
| `server/app/services/sms_service.py`                                     | Twilio `send_sms()` — graceful no-op when unconfigured; never raises                                                                           |
| `server/app/services/storage_service.py`                                 | Storage abstraction; `LocalStorageService` writes to `upload_dir` (S3-pluggable)                                                               |
| `server/app/services/customer_identity_service.py`                       | `upsert_customer()` — phone-keyed customer upsert (only correct write path)                                                                    |
| `client/lib/api-mock.ts` + `client/lib/mock-data.ts`                     | Demo/mock API layer, gated by `NEXT_PUBLIC_USE_MOCK_API=true`                                                                                  |
| `client/lib/business-docs-rag.ts` + `client/app/api/business-docs-chat/` | Docs RAG assistant (OpenAI); chunks in `client/lib/doc-chunks.json`                                                                            |
| `client/app/invite/[token]/` + `client/app/api/invite/`                  | Staff invitation accept flow (migration 012 `staff_invitations`)                                                                               |

---

## Product Direction

A multi-module operations platform purpose-built for bars and restaurants. Each module is independently subscribable:

- **Reservations** — table/seat booking flow, staff management, analytics
- **Queue** — walk-in digital queue; real-time live board
- **Ordering** — QR menu, customer self-order, kitchen/bar ticket board
- **Inventory** — ingredients, stock movements, par levels, low-stock alerts
- **Insights** — ML-based demand forecast, cancellation prediction, operational KPIs

Client-facing features that make the platform presentable:

- Business onboarding wizard
- Embeddable booking widget (iframe/JS snippet)
- Rich public business profile page
- SMS / WhatsApp reservation reminders

Design constraints:

- One business = one tenant; one login per business (no multi-business user in this phase)
- Businesses subscribe to modules independently
- One primary web dashboard; routes and nav depend on enabled modules
- Mobile/tablet apps later; same APIs and entitlement model
- Real-time transport: WebSockets (decided in Phase 0, implemented Phase 1.5+)
- `location_id` (nullable UUID) exists on reservations, orders, inventory, queue entries — single-location businesses leave it null

---

## Agreed Clarifications (Scope)

1. **Ordering** — Customer self-order via QR + menu. Internal: kitchen/bar ticket board with status transitions and routing tags.
2. **Queue** — Customer scans QR at the door → joins digital queue. Staff sees live board, can call/seat/remove. No account required.
3. **Inventory** — Restaurant inventory (ingredients, stock, par levels). Not warehouse WMS.
4. **Billing** — Deferred. Module enablement flags exist in data model. Static marketing/pricing pages (`/pricing`, `/for-businesses`, `/for-customers`) were removed in Phase 5.8.
5. **Tenancy** — One business per login; each business is a tenant.
6. **Real-time** — WebSockets via FastAPI + client hooks. SSE acceptable for read-only push; WS primary for ticket boards and queue state.
7. **Locations** — `location_id` added early (Phase 0) as nullable FK; retrofitting later touches every table. Single-location businesses ignore it.
8. **Widget** — Thin iframe wrapper + JS snippet around existing `/reserve/[business]`.
9. **Calendar sync** — Removed in Phase 5.8. Google OAuth/Calendar/Meet integration was removed entirely to focus on bars/restaurants. The `google_oauth_tokens` table was dropped in migration 013.
10. **Notifications** — Email exists. SMS/WhatsApp via Twilio added in Phase 1 as additional channel; `notification_service` dispatches to multiple providers.

---

## Roles & UI Strategy

- **Customer ordering / queue:** separate UX from staff (public QR-scan flow; often unauthenticated or session-token based). Separate routes/layout within the same Next.js app.
- **Staff (server, kitchen/bar, admin):** one dashboard shell with role + permission checks; kitchen vs bar modeled as stations/item routing tags + filtered ticket boards.
- **Permissions:** prefer permission names (`can_manage_menu`, `can_bump_tickets`, `can_manage_queue`, `can_view_inventory`) over job titles. Existing owner/manager/staff string roles become a convenience grouping, not the enforcement layer.

---

## Phase History

### Phase 0 — Foundation ✅

Fixed known auth and tenant gaps: `business_id` in JWT claims, `get_current_business` dependency, tenant isolation on all routers, `require_module()` guard, standardized error JSON, `location_id` column on relevant tables, event publish abstraction.

### Phase 1 — Entitlements + Dynamic Shell ✅

`GET /me/context` endpoint, frontend nav driven by entitlements, business onboarding wizard, rich public business profile, embeddable widget, SMS notification channel. (Google Calendar sync and static pricing page built here; both removed in Phase 5.8.)

### Phase 1.5 — Queue MVP ✅

Walk-in queue: customer QR scan → join queue → receive position. Staff live board: notify/accept/seat/remove. WebSocket channel per business (first production WS use). In-app notifications for all queue events. Optional SMS on call.

### Phase 2 — Ordering MVP ✅

QR menu → cart → order placement (idempotent). Real-time kitchen/bar ticket board. Staff status transitions (received → preparing → ready → served), plus `cancelled`, reachable from any non-terminal state — the full `orders.status` set is `{received, preparing, ready, served, cancelled}`, enforced by a CHECK constraint in migration 008 and the `OrderStatusUpdateRequest` regex. Item library (copy-on-add templates). `is_accepting_orders` toggle (503 on placement when off). WebSocket channel for orders.

### Phase 3 — Inventory MVP ✅

Stock items, movements (receive/adjust/waste), par levels, low-stock alerts via `notify_business_staff`. `current_quantity` denormalized. `menu_item_ingredients` recipe stub for Phase 8.

### Phase 4 — Event Stream + Real-time Hardening ✅

Single Redis Stream `crowbar:events`. `DomainEvent` + `publish()` (fire-and-forget). `XREADGROUP` consumer dispatches queue/order events to WS broadcast helpers. `ws_projections.py` extracted to avoid circular imports. Retry: 3× / 30 s XCLAIM; no DLQ.

Events: `queue.*` (party_joined/called/accepted/seated/removed), `order.*` (placed/status_changed), `inventory.*` (movement_recorded), `reservation.*` (created/updated/deleted).

### Phase 5 — Insights ✅

ML outputs surfaced: customer segmentation badges, high-risk reservation flagging (cancellation_probability > 0.6 from `ml_predictions`), 7-day demand forecast as staffing hint. Operational KPIs (reservations/ordering/inventory) from live DB queries. All behind `require_module("insights")`.

### Phase 5.5 — Demo Hardening ✅

Error boundaries, module-disabled screens, `ConfirmationDialog` for destructive actions, `hasModule()` shared utility, modules settings page, skeleton `loading.tsx`, `EmptyState` component, OpenGraph on booking page. See Demo-Hardening Status table above.

### Phase 5.6 — UX Refinements ✅

- **Sidebar reorganization:** each module gets its own `SidebarGroup` (Reservations, Queue, Ordering, Inventory, Insights). Removed catch-all "Operations" group. "Workspace" group is always visible.
- **OverviewCarousel:** merged `StaffingHintCard` and `InsightsCarousel` into a unified 3-slide carousel (staffing forecast, Q&A, booking link).
- **Slug→UUID consistency:** all four public routes (`/reserve`, `/queue`, `/menu`, `/order`) now follow the same SSR pattern — server component resolves slug to UUID, passes both as props to client component.
- **Customers in Workspace:** moved from Reservations group to Workspace (always visible). New `GET .../visitors` endpoint unions reservation customers + queue walk-ins via phone-based deduplication.

### Phase 5.8 — Bar/Restaurant Refocus ✅

Removed features irrelevant to bars/restaurants and simplified the reservation model:

- **Google Calendar/Meet/OAuth removed** — `google_oauth_service.py`, `google_meet_service.py`, `google_calendar_service.py` deleted; `google_oauth_tokens` table dropped; `/google/authorize` and `/google/callback` auth endpoints removed. **Note:** this was a service-and-endpoint-level removal only. Dead config/env/deps/docs residue (`config.py` `google_*` fields, `server/env.example` `GOOGLE_*` vars, four `google-*` pip packages, landing-page "Google Calendar sync" copy, a backlog item, and stale MDX docs describing Google Meet / online-video services) survived until the post-B.3 cleanup pass below finished the job.
- **Customer portal removed** — entire `/customer/` Next.js route tree deleted; backend `GET /reservations/my`, `GET /reservations/customer/{id}`, `GET /analytics/customer/my` endpoints removed
- **Service types simplified** — `is_online`, `requires_payment`, `amount`, `form_fields` dropped from model, schema, API, and UI; `FormFieldBuilder`, `DynamicField`, `PaymentStep` components deleted
- **Reservation payment stubs removed** — `payment_amount`, `payment_status`, `stripe_payment_intent_id`, `meeting_link`, `custom_fields` dropped from `Reservation` type and all mappers
- **Marketing pages removed** — `/pricing`, `/for-businesses`, `/for-customers` pages deleted; references removed from middleware
- **Booking form simplified** — 4 steps only: type → datetime → contact info (+ note) → confirmation/success
- Migration 013 applies the schema changes

### Phase 5.9 — Multi-Channel Foundations ✅

Built the data layer the upcoming WhatsApp/chatbot intake + per-table QR + delivery flows depend on. Single-pass cutover; no dual-state code remains.

**Schema (migration 014 + 015):**

- New `customers` table (business-scoped, partial unique index `(business_id, phone) WHERE phone IS NOT NULL`). Phone is the canonical key across channels; email is a non-unique attribute.
- New `tables` table (label, capacity, qr_token_revision, soft-delete) for per-table QR ordering.
- New `bot_configs` table (one row per `(business_id, channel)`: greeting, tone, enabled_intents, hours_behavior).
- Orders gain nullable `customer_id` (FK customers), `channel ∈ {qr, whatsapp, chatbot, web, staff}`, `fulfillment_type ∈ {dine_in, delivery, pickup}`, `table_id`, `delivery_address`, `scheduled_for`.
- Reservations and queue_entries gain `channel` + `idempotency_key` (partial unique index).
- Businesses gain `ordering_config jsonb` (`allowed_fulfillment_types`) and `bot_enabled boolean`.
- **Cutover (015):** `reservations.customer_id` retargeted from `users(id)` → `customers(id)` (NOT NULL); orphaned `users.user_type='customer'` rows deleted.

**Service-layer changes:**

- New `customer_identity_service.upsert_customer(db, business_id, phone, email, name)` — phone-keyed upsert; returns `None` for phoneless calls (no anonymous customer rows).
- `reservation_service.create_reservation` and `create_public_reservation` upsert a customer and link the reservation; both stamp `channel="web"`. Auth-path no longer uses `current_user.id` as a customer FK.
- `customer_service.get_customers_by_business` and `get_all_visitors` rewritten to query `customers` instead of `users`.
- Dead customer-portal code removed: `notification_service.notify_user`, `_customer_patch_kind`, `nconst.CUSTOMER_RESERVATION_*`, `analytics_service.get_customer_dashboard_stats`, `/api/analytics/customer/me`, `/api/analytics/customer/{id}`. Customer-targeted SMS on patch/delete is preserved (uses `reservation.phone`, no User row needed).
- `reservation_notifications.ReservationSnapshot` and `_MATERIAL_PATCH_KEYS` no longer reference removed payment fields.
- `service_type_service.create_service_type` no longer passes removed `requires_payment`/`is_online`/`amount`/`form_fields` kwargs (Phase 5.8 cleanup gap).
- Frontend `/api/customers/{id}` endpoint replaced with `/api/customers/business/{business_id}/{customer_id}` (URL-level scoping). `apiGetCustomer`, `fetchCustomer`, mock `fetchCustomer` deleted as dead code.

**Module flags unchanged.** No new module key for delivery — it's a fulfillment mode under `ordering`, gated by `ordering_config.allowed_fulfillment_types`.

### Phase B.1 — Tabs (simplified) ✅ (most recent)

First slice of the bars-only Tier B work. An open, appendable **tab** groups multiple discrete orders under one running total, closed out with a **simulated** settlement. Additive — pure per-order placement (QR, pickup, delivery) is unchanged; tabs replace nothing.

**Schema (migration 016):**

- New `tabs` table: `status` (`open|closed`), `channel`, `opened_by`/`closed_by` → `users`, `opened_at`/`closed_at`, `settled_method` (`cash|card|comp|other`), nullable `table_id` (→ tables) and `customer_id` (→ customers).
- `orders` gains nullable `tab_id` FK. No `running_total` column — the tab total is computed on demand.

**Service / API:**

- `tab_service`: `open_tab`, `add_order_to_tab` (thin wrapper over `order_service.place_order` + stamps `tab_id`), `get_tab_total` (live `SUM` over non-cancelled orders), `close_tab` (requires `settled_method`).
- `tabs.py` router (`/api/tabs*`, behind `require_module("ordering")`, tenant-scoped via `get_current_business`): `GET /api/tabs?status=open|closed` (list), `POST /api/tabs`, `GET /api/tabs/{id}`, `POST /api/tabs/{id}/orders` (409 if closed), `POST /api/tabs/{id}/close` (404 if missing, 409 if already closed).
- Adding an order to a tab publishes `order.placed`, so tab orders flow through the existing ticket board unchanged.

**Frontend:** `client/app/business/tabs/` — loads the business's open tabs on mount (via `GET /api/tabs?status=open`, so they survive a refresh), open a tab, view associated orders + running total, close via a settlement-method dialog (not `confirm()`). Sidebar "Tabs" entry under the Ordering group. **Add-order compose UI:** an "Add order" action on an open tab opens a staff-facing menu/cart dialog (`tab-order-compose.tsx`) that drives `POST /api/tabs/{id}/orders`; the tab detail auto-refreshes after a successful add. See the post-B.4 compose-UI pass below and Non-Obvious #38.

**Deliberately out of scope (deferred):** split/guest-level attribution, real payment processing, and table selection / party size on the compose UI (not yet wired).

### Phase B.2 — Happy Hour + Business Timezone ✅ (most recent)

Second slice of Tier B. Adds a **business timezone** and a **timezone-aware happy-hour** engine. Additive — items without a `happy_hour_price` and businesses without windows behave exactly as before.

**Schema (migration 017):**

- `businesses.timezone` — `VARCHAR(64)` NOT NULL default `'UTC'`, stores an IANA name (not a raw offset, so DST is correct). Existing/seed rows keep `'UTC'` (no backfill — pre-production).
- New `happy_hour_windows` table — business-wide windows: `name`, `days_of_week INT[]` (0=Monday..6=Sunday), wall-clock `start_time`/`end_time` (TIME, interpreted against `businesses.timezone`), `is_active`. Multiple windows per business; no DB limit.
- `menu_items.happy_hour_price` — nullable `NUMERIC(10,2)` flat override (NULL = never discounts; not a percentage).

**Canonical day-of-week (per handoff instruction):** standardized to **one** convention everywhere — 0=Monday..6=Sunday, matching Python `datetime.weekday()`. Single source: `server/app/constants/days.py` + its frontend mirror `client/lib/days.ts`. `analytics_service`, the onboarding wizard, the operating-hours settings, and the happy-hour day picker all consume it. (The handoff's schema comment said 0=Sunday; resolved to Monday=0 to match the existing repo convention — see "Clarifying questions" in the change summary.)

**Service / API:**

- `happy_hour_service.is_happy_hour_active(db, business_id, at=None)` — the **single source of truth**, timezone-aware via `zoneinfo`. Plus window CRUD.
- `happy_hour.py` router (`/api/happy-hour/windows*`, behind `require_module("ordering")`, tenant-scoped via `get_current_business`): list / create / update (404) / delete (404).
- **Two integration points, same function:** the public menu read stamps `menu.happy_hour_active` (items expose `happy_hour_price`), and `order_service.place_order` charges `happy_hour_price` when active. See Non-Obvious #35.

**Frontend:**

- `TimezoneCombobox` (searchable IANA list) added to the onboarding wizard (required; prefilled from the browser) and the Business Information settings page.
- Menu management: optional `happy_hour_price` per item (blank = no discount; clearing supported).
- New `client/app/business/happy-hour/` CRUD page (sidebar entry under Ordering) — shows the business timezone next to the time inputs.
- Public menu / order flow: opted-in items show the discounted price with the original struck through + a "Happy Hour" badge; the cart/checkout total follows the server-decided state.

**Deliberately out of scope (deferred):** percentage/formula discounts, per-item individual schedules, and any promo notification when happy hour starts/ends. (Overnight/cross-midnight windows were initially deferred but are now supported — see the post-B.2 wipe/overnight pass below and Non-Obvious #35.)

### Post-B.2 — Full Crowbar rename + overnight happy hour ✅ (most recent)

Two small completion passes, no schema changes:

- **Slotera → Crowbar wipe (completion).** The earlier rename was branding-copy only; this pass swept every remaining internal identifier, infra, and config reference. Renamed across `client/`, `server/`, `ml/`, `docs/`, `scripts/`, root files: package name, FastAPI/Celery/logger names, `email_from_name`, staff-invite email copy, the `Slotera:` SMS prefix, the DB name default (`slotera` → `crowbar`) in `config.py`/`migrate.py`/`conftest.py`/`docker-compose.yml`/env examples, container names (`slotera-db` → `crowbar-db`, etc.), `dev.sh`/`stop.sh` banners + `createdb`, the two leftover JSX comments, and — beyond the handoff's known-locations list — the `client/public/widget.js` DOM element IDs (`#slotera-*` → `#crowbar-*`), iframe title, and `slotera:close` postMessage type. The **Redis stream key `slotera:events` → `crowbar:events`** (defined once in `events.py` as `STREAM_KEY`; `stream_consumer.py` imports it). Widget embed URL is no longer hardcoded — `widget-snippet-client.tsx` now reads `NEXT_PUBLIC_WIDGET_BASE_URL` (placeholder default `https://crowbar.example`, documented in `client/env.example`). **Intentionally left:** `.claude/settings.local.json` (user-local, gitignored) and `server/.env` (machine-specific — the user's own file to update).
- **Overnight happy-hour windows.** `is_happy_hour_active` now handles `start_time > end_time` as a cross-midnight window active in two segments (listed day from start→midnight; day *after* a listed day from midnight→end, via `prev_weekday = (weekday - 1) % 7`). Same-day windows unchanged. The staff create form no longer rejects `start > end` (only an identical start/end). See Non-Obvious #35.

### Phase B.3 — Age Verification (self-attestation) ✅ (most recent)

Third slice of Tier B. A self-attestation speed bump on the ordering checkout plus a staff-facing visual cue. **Not** identity verification — no ID scan, no third-party service, no stored proof of age. Additive: items without `is_alcoholic` and carts without alcohol behave exactly as before.

**Schema (migration 018):** `menu_items.is_alcoholic`, `order_line_items.is_alcoholic` (snapshot at placement, like `routing_tag`), `orders.age_confirmed` (the attestation), `businesses.legal_drinking_age` (default 18, configurable per country).

**Service / API:** `order_service.order_contains_alcohol(items)` — single source of truth (derives "contains alcohol" from items, never stored). `place_order(..., require_age_confirmation=True)` re-validates server-side: raises `AgeConfirmationRequired` (→ 422) when an alcoholic cart lacks `age_confirmed`. **Channel-scoped structurally:** the public order endpoint enforces (default `True`); `tab_service.add_order_to_tab` (staff, in person) passes `False`. `OrderPlaceRequest.age_confirmed` is a request field; menu item create/update carry `is_alcoholic`; `BusinessUpdate/Response` carry `legal_drinking_age`.

**Frontend:** checkout shows a self-attestation checkbox ("I am at least `{legal_drinking_age}` years old") **only** when the cart contains an alcoholic item, and gates the Place Order button on it. Ticket board shows an "Alcohol" badge on alcoholic line items (the real ID-check cue). Menu management has an `is_alcoholic` toggle per item; Business Info settings has an editable legal-drinking-age field. Seed (`001_seed_puzzles.sql`) marks Puzzles Bar drinks alcoholic so the flow is demoable.

**Resolved judgment calls (asked up front):** (a) line-item alcohol → **snapshot column** (robust to menu edits/deletion), not derive-by-join; (b) attestation → **stored on the order** (`age_confirmed`); (c) legal drinking age → **editable** in settings, not schema-only. **Deliberately out of scope:** ID scanning / OCR / third-party verification (see Future — ID Verification), cross-session attestation persistence, gating menu browsing (only checkout is gated), any reservation-flow change, and an alcohol flag on the item library.

### Post-B.3 — Google removal residue cleanup ✅ (most recent)

Finished the Google OAuth/Calendar/Meet removal that Phase 5.8 only did at the service/endpoint level (same find-everything-first method as the Slotera wipe). No schema changes — the `google_oauth_tokens` drop (migration 013) and the create→drop migration history (003/006/013) were already correct and are left intact as historical record.

Removed the surviving residue: `config.py` `google_client_id/secret/redirect_uri/connect_success_url` fields; `server/env.example` `GOOGLE_*` vars; the four unused `google-*` pip packages in `requirements.txt`; the stale `google_oauth_tokens` drop line in `migrate.py`'s dev `reset_database`; the landing-page "Google Calendar sync" module bullet + "calendar sync" copy (`page.tsx`); the `business-docs-chat-trigger` "connecting Google for Meet" example; a stale proxy-route comment; and the "Google Calendar API — Async Execution" backlog item. Rewrote the MDX docs (`managing-services`, `handling-reservations`, `making-a-reservation`, `managing-reservations`, `faq`) to drop Google Meet / online-video-service references, then regenerated `doc-chunks.json` (RAG source).

**Beyond pure Google (flagged, then cleaned in the same docs):** those MDX files also still documented other Phase-5.8-removed features — Stripe payment-at-booking, "online (video) service" types, `meeting_link`, and custom-form fields. Since they're documented-removed and the docs were actively wrong, they were cleaned in the same pass. **Separately flagged, NOT acted on:** the docs also claim **ICS calendar attachments / calendar invites** on confirmation emails, but no ICS-generation code exists in `email_service` and the `icalendar` dependency is unused — that's a separate unimplemented-feature gap, left for the user to decide.

**Justified remaining grep hits (all legitimate, not live Google integration):** `OAuth2PasswordBearer`/`oauth2_scheme` in `dependencies.py` (FastAPI JWT bearer, not Google); `next/font/google` in `layout.tsx` (Google Fonts / Geist); "Google Chrome" in the FAQ supported-browsers list; migrations 003/006/013 (historical create→drop record); and CLAUDE.md's own historical removal notes.

### Phase B.4 — Pour/Keg Inventory + Recipe Wiring ✅ (most recent)

Fourth slice of Tier B, merged with **Phase 8** (Recipe Management & Inventory Sync) per the standing note that they overlap and shouldn't be built twice. Wires the previously-dead `menu_item_ingredients` stub (Non-Obvious #10) into real recipes, teaches inventory unit-of-measure so spirit pours and kegs are tracked accurately in ml, and auto-deducts inventory on order fulfillment. Additive — `each`-type inventory and items without recipes behave exactly as before.

**Schema (migration 019):**

- `inventory_items.unit_type` (`each`/`bottle`/`keg`; `bottle`/`keg` = liquid in ml) + `inventory_items.container_volume_ml` (ml per container, for container→ml receive).
- `menu_item_ingredients`: dropped the redundant `unit` column; `quantity` is now the amount in the linked inventory item's native unit (ml for bottle/keg, count for `each`).
- `stock_movements.movement_type` CHECK gains `'sale'` (system-generated recipe deduction).

**Backend:**

- `inventory_service.apply_movement` — schema-free movement core extracted from `record_movement`, reused by recipe `sale` deductions. `record_movement` resolves a container-count receipt (`container_quantity`) to a ml delta via `container_volume_ml`.
- New `recipe_service`: `get_recipe`/`set_recipe` (replace-all), `deduct_for_served_order` (best-effort, non-blocking; auto-disables menu items whose ingredient hits ≤ 0), `get_menu_item_stock_info` (low-stock flag + live servings-remaining; was `get_low_stock_menu_item_ids`, superseded in the servings/pours pass — Non-Obvious #44).
- `order_service.advance_order_status` calls the deduction on the `served` transition only.
- New `MenuItemIngredient` model + `recipe.py` schemas; recipe GET/PUT + `menu-item-stock-flags` endpoints on the ordering router (behind `require_module("ordering")`).

**Frontend:**

- Inventory item form: `unit_type` selector + `container_volume_ml` (with US+metric presets, free-entry override); receive dialog offers "containers vs ml" for bottle/keg with a live ml preview.
- Menu management: per-item **Recipe** editor (inventory-item + quantity rows, ml/oz toggle that converts to ml on save) + a **low-stock badge** when any recipe ingredient is below par.
- `client/lib/units.ts` — presets + ml⇄oz + `isLiquidUnitType`.

**Resolved judgment calls (asked up front):** (a) auto-disabled items require **manual re-enable** (a single `is_available` flag can't distinguish auto-disable from a staff 86, so auto-restore would clobber deliberate disables); (b) recipe quantities are stored in the ingredient's **native unit** (not forced ml-only), so cocktail garnishes (`each`) and pours (ml) coexist in one recipe. **Not asked (handoff already decided):** out-of-stock at `served` never blocks the transition. See Non-Obvious #37.

**Deliberately out of scope (deferred):** waste/line-cleaning/pour-variance accounting (Tier C), per-keg-instance tracking (inventory stays pooled), reorder suggestions (Phase 9 ML V2), and any change to how `each`-type inventory behaves (fully backward compatible). Demo seed (`001_seed_puzzles.sql`) adds ml liquid items + a Mojito recipe (rum below par → visible low-stock badge).

### Post-B.4 — Tab Add-Order Compose UI ✅ (most recent)

Closed the one deferred gap from Phase B.1: the add-order-to-tab endpoint (`POST /api/tabs/{id}/orders`) existed but had no UI. This is frontend-only — no schema, no new endpoint, no service change.

- **Shared cart logic** extracted to `client/lib/cart.ts` (`CartItem` + `toggleModifier`, `effectivePrice`, `cartItemLineTotal`, `cartTotal`, `cartItemCount`, `addCartEntry`). The public menu (`menu-client.tsx`) was refactored to consume it, so the new compose UI reuses the same modifier/pricing/merge rules instead of duplicating them.
- **`tab-order-compose.tsx`** — a staff-facing menu/cart dialog reached from an "Add order" button on an open tab. Browses the menu (via the public `clientGetMenu`, which carries the server-decided `happyHourActive`), picks items + modifiers + notes, and submits via new `clientAddOrderToTab` → `POST /api/tabs/{id}/orders`. No customer contact step, no age-attestation checkbox (staff path).
- **Auto-refresh:** on a successful add, the compose dialog calls back into `tabs-client.tsx` which re-fetches the tab (`clientGetTab`) so the total + order list update without the manual refresh button.
- **Happy hour + age verification are correct for free** because the add goes through `tab_service.add_order_to_tab` → `order_service.place_order` (the standard placement path): happy-hour pricing is applied server-side, and `require_age_confirmation=False` skips the self-service age gate for staff-entered orders. See Non-Obvious #38.

**Deliberately out of scope (deferred):** split/guest-level attribution, real payment processing, and table selection / party size on the compose UI.

### Phase B.5 — Ticket Board Redesign + Order Status Audit Log ✅ (most recent)

Rebuilt the kitchen/bar ticket board around **status columns** and added a **status audit trail** with **backward** transitions that correctly reverse inventory. Additive — the four order statuses are unchanged (`received → preparing → ready → served`, plus terminal `cancelled`); no relabeling, no new states.

**Schema (migration 020):**

- `order_status_timeline.from_status` (nullable) — the existing timeline is extended into the audit log (from→to per row), rather than adding a parallel `order_status_history` table. Initial `received` placement row keeps `from_status`/`changed_by` NULL (creation, not a transition).
- `stock_movements.order_id` (nullable FK → orders, `ON DELETE SET NULL`) + index — links recipe `'sale'`/`'sale_reversal'` movements to their order so an un-serve can find and reverse exactly what that order deducted.
- `stock_movements.movement_type` CHECK gains `'sale_reversal'`.

**Backend:**

- `order_service._TRANSITIONS` adds one-step **backward** moves (`preparing→received`, `ready→preparing`, `served→ready`); forward advances unchanged. `advance_order_status` records `from_status` on every timeline row, deducts on entering `served`, and calls the new **reversal** on leaving `served`.
- `recipe_service.reverse_deduction_for_order` — sums the order's own `'sale'`/`'sale_reversal'` movements per item and credits back the outstanding net (precise, not a recipe recompute; idempotent; best-effort/non-blocking). Auto-disabled items are **not** auto-re-enabled (manual re-enable policy).
- `inventory_service.apply_movement` takes an `order_id`; `deduct_for_served_order` passes it.
- `get_orders_for_board` default view now returns active tickets **plus** today's served tickets (business-timezone day start, capped at 50 newest) so the `served` column is useful for backward-correction without unbounded growth. **"Today" is keyed off when the order actually entered `served` — the `order_status_timeline` `→served` row's `changed_at`, not `orders.placed_at`** (see the post-B.5 correction below). An explicit `?status=` filter is honored literally (no served bound). `order_to_dict` now includes `status_timeline` so the live WS board carries history.

**Frontend (`ticket-board-client.tsx` rebuild):**

- **Status columns** (received/preparing/ready/served) are the primary Kanban axis. **Station is an All/Kitchen/Bar filter** at the top (filters which tickets/line-items are visible), **not** a second grid axis or a permanent split.
- Each card has a **back** (◀, one step, disabled on `received`) and an **advance** (▶) control; **any** staff member can move **any** ticket either direction (no permission gate — that's Phase 7 RBAC, which doesn't exist yet).
- Per-ticket expandable **History** list (from `status_timeline`) — plain list, no export/filter.
- The alcohol badge, `tableIdentifier`, modifiers, and line-item notes are preserved. Also fixed a pre-existing bug where the **WebSocket** order mapper (`use-order-socket.ts`) dropped `is_alcoholic`, so the alcohol badge silently vanished on any live push (initial HTTP fetch had it; WS didn't).

**Resolved judgment calls (asked up front):** (a) audit trail → **extend `order_status_timeline`**, not a new `order_status_history` table (it was already a same-handler transition log serialized to customers); (b) backward granularity → **previous-step only** (matches "correct an accidental click", keeps the `served` reversal boundary simple); (c) `served` column scope → **served-today, capped ~50** (business tz).

**Feature-interaction checks:** alcohol badge preserved (and WS-path bug fixed); happy-hour has **no** ticket-side indicator to preserve (the board never displayed prices — happy hour is a menu/pricing concern, not a fulfillment one); there is **no** tab reference on tickets today (the `Order` type/`order_to_dict` never carried `tab_id`), so nothing to regress there — `tableIdentifier` is the only location reference and is preserved.

**Deliberately out of scope (deferred):** the broader Phase 10 audit-log system (export, cross-entity, viewer permissions — Non-Obvious #41 spells out that this is NOT that); role-based restriction on who can move tickets (Phase 7); any change to the status enum; and a cancel control on the board (none existed before, none added).

### Post-B.5 — Served-column window keyed off serve time (correction) ✅ (most recent)

Two small follow-ups, no schema changes:

- **Served-column boundary corrected from placement time → serve time.** The B.5 "served today" branch of `get_orders_for_board` originally filtered by `orders.placed_at`, which is the wrong field: an order placed late last night but served this morning belongs in today's list, and one served on a later day shouldn't linger. It now filters/sorts by when the order actually **entered `served`** — a subquery over `order_status_timeline` taking `MAX(changed_at)` of that order's `status='served'` rows (the **most recent** `→served`, since un-serve/re-serve can create several — Non-Obvious #40). Same business-timezone day boundary and same ~50 cap; only the field changed. Verified: placed-yesterday/served-today now appears; placed-and-served-yesterday doesn't; re-served-today (with an older served row) appears off the latest serve.
- **eslint clean-up in `use-order-socket.ts`.** Fixed the `react-hooks` violation on the recursive reconnect: `connect` no longer references itself before declaration — the reconnect timer calls it through a `connectRef` that (like `onUpdateRef`) is synced in a `useEffect`, never mutated during render (the strict `react-hooks/refs` rule forbids ref writes during render). Reconnect/backoff behavior is unchanged. The sibling **`hooks/use-queue-socket.ts` had the identical recursive-`connect` pattern and lint error; it received the one-for-one same fix in a follow-up pass** (`connectRef` + `onUpdateRef` synced in effects, reconnect/backoff unchanged, eslint clean).

### Post-B.5 — Servings/Pours Remaining (staff-facing) ✅ (most recent)

Two live "how much is left" numbers, staff-facing only, both compute-on-demand (no stored count). Full design + the non-independence caveat in **Non-Obvious #44**.

- **Menu-item servings remaining (recipe-exact).** For an item with a recipe, `min` over ingredients of `floor(current_quantity / recipe_quantity)`. `recipe_service.get_low_stock_menu_item_ids` was **replaced** by `get_menu_item_stock_info` (returns `{has_low_stock_ingredient, servings_remaining}` per menu item in one query); the `menu-item-stock-flags` endpoint response widened from `list[UUID]` → `list[MenuItemStockFlag]`, and its client from `string[]` → `MenuItemStockInfo[]`. Surfaced on menu-management item cards as a **separate neutral badge** next to (not merged into) the amber low-stock badge — low-stock is a below-par warning, servings is an absolute count. Items with no recipe show nothing (never `0`). Labeled "~N servings left" (not called an estimate — it's exact given current stock).
- **Bottle/keg pours remaining (rough estimate).** New nullable `inventory_items.default_pour_ml` (migration 022): an optional reference pour, independent of any recipe; `floor(current_quantity / default_pour_ml)` computed live client-side in the inventory list. Unset ⇒ no estimate. Entry field (bottle/keg only) reuses the ml/oz toggle + a `POUR_PRESETS` dropdown (1/1.5/2 oz + 25/50 ml), stored in ml. Labeled "~N pours left (est.)" — the "(est.)" distinguishes it from the recipe-exact servings number. Seed sets it on the three ml demo liquids.
- **Docs:** added "Future — Public-Facing Servings/Pours Display" (surfacing either number to customers; needs product/copy decisions) and annotated Tier C "Keg level + line-cleaning reminders" as speculative/v2+.
- **Judgment call (not asked — defensible default):** the servings number is a **separate neutral badge**, not an extension of the amber low-stock badge, because the two are semantically different kinds of figure (threshold warning vs absolute count).

### Phase 6 — Stations & Routing (Planned)

Replace the hardcoded `routing_tag` enum (`kitchen | bar | any`) on menu items with a proper stations model:

- `stations` table (`id`, `business_id`, `name`, `color`, `is_active`); migration to replace `routing_tag` with `station_id` FK on `menu_items`
- Visual routing admin page: map categories and individual items to stations
- Ticket board updates to filter by station assignment
- Staff can be assigned to one or more stations

### Phase 7 — RBAC (Planned)

Proper role-based access control tailored to service businesses:

- `business_roles` table (`id`, `business_id`, `name`, `permissions: JSONB string[]`)
- Predefined role templates: owner, manager, bartender, cook, host, server
- `require_permission("can_manage_menu")` FastAPI dependency replacing loose role string checks
- Platform admin scope (cross-business Crowbar superadmin)
- Role management UI in staff/settings; roles assignable per staff member

### Phase 8 — Recipe Management & Inventory Sync ✅ (done in Phase B.4)

Wired the `menu_item_ingredients` stub into real functionality (merged with the Tier B pour/keg work — see Phase B.4 below and Non-Obvious #37):

- [x] Recipe builder UI per menu item: map ingredients + quantities (ml/oz toggle)
- [x] Auto-deduct inventory when an order reaches "served" status
- [x] Auto-disable menu items when any required ingredient hits zero stock (manual re-enable)
- [x] Low-stock warning badges on menu item cards in the management UI

### Phase 9 — ML V2 (Planned)

Demand/stock forecasting using ordering + inventory signals. Reorder suggestions. Staffing hints from reservation + order demand patterns. Feedback mechanism (helpful/unhelpful) for ML recommendations.

### Phase 10 — Hardening + Optional Service Extraction (Planned)

Full permission audit + granular permission UI post-RBAC. Audit log exports. Rate limiting per tenant. Performance: caching for public routes, query optimization. Tracing (OpenTelemetry), SLO definitions. Extract services only with load evidence. Stripe integration for module subscriptions.

---

## Bars-Only Conversion Plan (Proposed — not yet started)

**Goal:** Narrow the product from a generic "bars and restaurants" serving-industry platform to an
**all-in-one operations platform for bars** (cocktail bars, pubs, nightlife venues). The architecture
already leans bar-friendly — `routing_tag` has a `bar` lane, the demo tenant (`001_seed_puzzles.sql`,
"Puzzles Bar") is a cocktail bar, and Phase 8's recipe→auto-deduct is effectively cocktail pour-costing.
The work is mostly reframing + a handful of bar-specific features.

Sequenced cheapest-highest-impact first. Tiers are independent enough to stop after any one.

### Tier A — Rebrand & Terminology (low effort, no schema changes)

- [ ] Update product framing throughout to **bars only** (this file's Project Overview / Product Direction, landing page, README).
- [ ] Rewrite landing page, onboarding wizard, and MDX docs copy for a bar audience.
- [ ] Rework `service_types` default labels/seed → bar bookings: _Table Reservation, Bar Seat, Booth, Bottle Service, Private Event_. (Data/label only — no model change.)
- [ ] Default menu categories in seeds/onboarding → _Cocktails, Beer, Wine, Spirits, Non-Alcoholic, Bar Bites_.
- [x] Delete orphaned customer-portal components + empty dirs (done — see Non-Obvious #33).

### Tier B — Core Bar Features (medium — model + logic)

- [~] **Tabs**: DONE (Phase B.1, simplified; add-order compose UI landed post-B.4) — a `tabs` table groups discrete orders under one running total, closed with a simulated `settled_method`. Additive (orders can still be standalone). Total computed on demand. GET list of open tabs and the add-order-to-tab compose UI are now built (see Non-Obvious #38). **Still deferred:** split/guest-level attribution, real payment processing, table/party-size on the compose UI.
- [x] **Age verification**: DONE (Phase B.3) — `is_alcoholic` flag on menu items drives a self-attestation checkbox on the ordering checkout (server-re-validated via `age_confirmed`; channel-scoped so staff/tab orders skip it) and an alcohol badge on staff order tickets. `businesses.legal_drinking_age` (default 18) is configurable and read for the copy — no age hardcoded. Ordering-only; self-attestation, not ID verification (see Future — ID Verification). **Deferred:** the door/queue age gate and door ID-check flag were not built (this pass is ordering checkout only).
- [x] **Happy hour**: DONE (Phase B.2) — business-wide `happy_hour_windows` (timezone-aware, day-of-week + wall-clock range) + a flat `menu_items.happy_hour_price` opt-in. One `is_happy_hour_active` function drives both the public menu display and order-placement pricing. Also landed `businesses.timezone` (IANA) and a single canonical day-of-week enum (Monday=0) shared front/back. Overnight (cross-midnight) windows are now supported (post-B.2 pass). **Deferred:** percentage/formula discounts, per-item schedules, promo notifications.
- [x] **Pour/keg inventory**: DONE (Phase B.4, merged with Phase 8) — `unit_type` (`each`/`bottle`/`keg`) with liquids tracked in ml, `container_volume_ml` for container→ml receive, and full recipe wiring (`menu_item_ingredients`) with auto-deduction on `served`, zero-stock auto-disable (manual re-enable), and menu-item low-stock badges. ml/oz toggle in the recipe builder is frontend-only. See Non-Obvious #37.

### Tier C — Nightlife Platform (larger — new surface)

- [ ] **Door management**: live occupancy vs capacity tracking; optional cover charge on the queue.
- [ ] **Guest list / VIP / comps** on reservations.
- [ ] **Keg level + line-cleaning reminders** (rides on the existing Celery beat scheduler). **Speculative — deferred to v2+ pending real signal:** this came from initial product planning, not a validated bar request; don't build it without a concrete ask. (The other two Tier C items above stand.)

**Notes for whoever picks this up:**

- Keep it simple; build only what a bar actually needs. Follow the single-pass migration rule (Non-Obvious #29) — no parallel columns / deferred cleanup.
- Tier B "pour/keg inventory" and Phase 8 (Recipe Management) overlap heavily; do them together.
- Payments/Stripe remain deferred (Phase 10), so Tabs close-out and cover charge are tracking-only until then.

---

## Visual Redesign — Phase 1 ✅ + Phase 2 ✅

**Phase 1** landed the identity on the four public guest pages (`/menu`, `/order`,
`/reserve`, `/queue` + shared `ReservationForm`) and the staff Overview.
**Phase 2** replaced the green-based staff palette with the SRM beer palette (below),
added a staff **dark/light toggle**, unified dashboard typography/padding, rebuilt the
**landing page** (revised again in the follow-up pass below), the **Overview**
(bar-general), and the **Schedule** (day-ledger layout), and added one read-only backend aggregation
(`analytics_service.get_bar_ops_snapshot`) for the Overview. Both passes are
styling/markup only otherwise — verified by construct-level diff audits (hook/handler/
storage/API-call counts vs HEAD), tsc-output parity with HEAD, the 46-test backend
suite, and live authenticated requests. The token system below is the durable
contract; extend it rather than reintroducing ad-hoc colors/fonts.

### Design token system v2 ("measured in SRM")

All tokens live in `client/app/globals.css`; fonts are loaded in `client/app/layout.tsx`.
Every tone is pinned to a named referent — the SRM beer-color scale plus wood/brass —
not generic beige-and-brown.

- **Palette (brand constants, same in both themes):** `--pilsner`-family light ground
  `#F7F1E1` (SRM 3; `--background` light) with `foam #FDFAF1` cards; `--lager #E8B54A`
  (SRM 8 — beer-gold accent: emphasis chips, dark-mode primary, happy-hour);
  `--marzen #B98733` (SRM ~12 — **interpolated midpoint of lager→dubbel**, added in
  the 2.2 pass as the feature deck's third tone; if another in-between tone is ever
  needed, interpolate within the SRM ordering like this — never an unrelated hue);
  `--dubbel #8A5A1C` (SRM ~17 — interactive primary on light); `--porter #251811`
  (SRM 35 — the shared dark ground); `--brass #C89B3C` (rules, dot leaders) +
  `--brass-deep #7D5F1F` (brass legible on light); `--oxblood #8C3A34` (destructive);
  ink `#2B2016` / foam-text `#F3EDE3`. Utilities: `text-brass`, `bg-lager`,
  `text-dubbel`, `bg-porter`, etc. (Phase 1's bottle green is **retired**.)
- **Themes — one dark, two entry points:** `:root` = taproom by day (staff light +
  landing). `.theme-night` (guest pages, applied to `<html>` by `<NightTheme />`) and
  `.dark` (staff dashboard) **share one token block** — the staff dark mode and the
  guest night atmosphere are deliberately the same warm room, never two dark concepts.
- **Staff theme toggle:** `client/components/staff-theme.tsx` — `StaffThemeToggle`
  (sun/moon in the dashboard header) + `StaffThemeInit` (applies stored choice while
  the dashboard is mounted, removes on unmount) + an inline pre-hydration boot script
  in `client/app/business/layout.tsx` (no light flash). Persisted in
  `localStorage["crowbar-staff-theme"]`. Scoped to the dashboard; guest pages keep
  forcing `.theme-night`.
- **Type roles (unchanged from Phase 1, now applied uniformly):** Libre Caslon Text
  (display — `font-display` / `.page-title`), Hanken Grotesk (body — `--font-sans`),
  Spline Sans Mono (`.figures` — prices, timestamps, counts). **Every dashboard page
  title must use `.page-title`** (raw `text-2xl font-semibold` headings were the
  Phase 1 inconsistency and were all converted); page roots use `.page-container` /
  `.page-pad` for the shared wide horizontal padding.
- **Signature element:** the **dot-leader line** (`.leader-dots`) — menu rows, cart
  lines, totals, hours, the landing module "menu" and pour-scene feature rows.
- **Supporting vernacular:** `.eyebrow`, `.rule-double`, `.coaster`, `.glow-pulse`,
  `.fade-rise` (reduced-motion-safe). **Hierarchy rule (dashboard-wide):** numbers and
  charts dominate (`.figures`, big numerals), chrome recedes (borders at `/40`),
  labels label — no narrating paragraphs next to figures.
- **Charts:** use `var(--chart-1..5)` (theme-aware), not hex, for status/series hues;
  service-type colors remain user data.

### Landing page (Phase 2.1 revision — supersedes the Phase 2 pour scenes)

The Phase 2 SVG pour-scene animation was **removed entirely** (`pour-scene.tsx`
deleted, not orphaned) and replaced with a photography-led structure. Four real
photographs live in `client/assets/` (`crowbar-hero.jpg`, `beer-tap.jpg`,
`inventory.jpg`, `cocktail.jpg`) and are statically imported via `next/image`
(blur placeholders). All scroll effects write to refs per frame (no re-renders)
and go static under `prefers-reduced-motion`.

- **Hero** (`components/landing-hero.tsx`): unchanged copy over `crowbar-hero.jpg`
  at 35% base opacity; across the hero's own scroll range the photo fades 1 → 0
  while the text parallax-drifts upward slower than the page and fades on the same
  curve.
- **Info sections** (`components/photo-panel-section.tsx`, "Never lose a round" /
  "Every pour, accounted for", copy unchanged): three independent scroll layers —
  text at document rate; a **non-full-bleed accent panel** (3/4-width color block,
  `bg-lager` for the beer-tap section, `bg-dubbel` for the inventory section) with
  a mild counter-drift; the photograph rendered 130% of its `overflow:hidden`
  frame's height, translating within it faster than the panel, motion clipped to
  the frame.
- **Modules** (`components/feature-stack.tsx`): the five features as a **sticky
  fanning deck** — each card `sticky top-[20vh]` with the whole section as its
  containing block (mobile hairline separators are wrapped in `md:contents` so
  they don't break that), so cards stack as later ones arrive; already-stuck cards
  get a continued smoothstep drift (translate + slight scale-down + dim) per later
  arrival. Card internals: name + mono `01`–`05` marker, hairline, display-face
  motto, hairline, **prominent** description. Solid palette tints per card
  (`bg-card/muted/secondary/accent`) keep the deck opaque but distinguishable.
  **Mobile (< md): plain sequential list, no stacking.**
- **Entrance animation** (`components/reveal.tsx` + `.reveal`/`.is-in` in
  globals.css): subtle fade-in + slide-up on first viewport entry, once per
  element (observer unobserves), used across the landing page's text. The feature
  cards deliberately don't get it (no competing motion with the stack).
- **Merged CTA + footer**: one `theme-night` `<footer>` (token re-scoping via the
  shared night block) with `cocktail.jpg` at 20% opacity under a porter gradient;
  CTA ("Last call" / register + `ContactDialog`), `rule-double`, footer columns
  (About, `NewsletterForm`, Contact), and a dot-leader bottom line
  (`Crowbar ····· © year`). The **"Setup in minutes / Replace 5 tools / Staff the
  rush" band and the "Demo Notice" disclaimer were removed** (the only content
  removals; the "Scroll to pour" cue text also went with the pour scenes — the
  bounce arrow remains).
- All functional pieces kept and construct-audited vs HEAD: `fetchBusinesses`,
  `PricingModal` (hero + "View pricing →" after the deck), `ContactDialog` ×2,
  `NewsletterForm`, `BusinessesCarouselSection`, register links. (The 2.2 pass
  below deliberately changed two of these: `NewsletterForm` removed,
  `ContactDialog` ×2 → ×1 + an inline footer form.)

### Landing page (Phase 2.2 revision — FAQ, merged panel, wide deck, footer form)

Refinement pass over 2.1 — same photo-led structure, no content rewrites outside
what's listed. Same discipline: refs-per-frame scroll effects, reduced-motion-safe,
construct-audited (tsc file-level parity, eslint-clean, SSR-render + compiled-CSS
verified live).

- **FAQ section** (`components/faq-section.tsx`, new — placed between social proof
  and the footer): two columns split by a hairline. Left rail (sticky on lg) carries
  an oversized display-italic numeral mirroring the currently-open question (re-runs
  `.fade-rise` on change via a React `key` swap), an "of 0N" `.figures` caption,
  eyebrow ("Questions"), heading ("Asked at the bar"), intro. Right column is a
  numbered accordion — one open at a time, toggling closed allowed; the rail numeral
  tracks the **last-opened** index so it never goes blank. Answers expand via the CSS
  `grid-rows-[0fr→1fr]` trick (no JS measurement); rows have `aria-expanded` /
  `aria-controls`. **The Q&A copy in `page.tsx` (`faqItems`) is DRAFT marketing copy**
  — grounded in shipped features (module toggling, QR flows, ml pour tracking +
  auto-86, tabs with settlement-but-no-card-processing, timezone-aware happy hour,
  insights) but written by the 2.2 pass and awaiting owner review.
- **Info sections — ONE shared panel** (`PhotoPanelGroup`, same file as
  `PhotoPanelSection`): the two per-section accent panels merged into a single
  continuous block spanning both sections' combined height, `left/right-[5%]`
  (~90% viewport width), with a subtle `bg-linear-to-b from-lager to-dubbel`
  gradient — lager behind the beer-tap section, dubbel behind the inventory one,
  preserving each section's color identity in one shape. The group owns the panel
  counter-drift; each section keeps its own image-in-frame layer. Because the copy
  now sits **on** the panel, `PhotoPanelSection`'s `panelTone` prop became
  `on: "lager" | "dubbel"` — it picks legible text tones (ink-derived tints on
  lager; foam/lager tones on dubbel) instead of painting a panel.
- **Parallax magnitude doubled:** panel drift −36px → −72px; the photo is now 160%
  of its frame (was 130%, `-top-[30%]`) translating ±14% of its own height (≈±22%
  of the frame, was ≈±8%) — still fully clipped to the frame.
- **Feature deck widened + right-anchored** (`feature-stack.tsx`): cards run from a
  visible left margin (`md:ml-[7vw]`) to a **flush right viewport edge**
  (`rounded-r-none`); `transform-origin: top right` so the recede-shrink pins the
  right edge/top-right corner and only the left + bottom edges pull inward — the
  2.1 `translateY` fan drift was **removed** (it would have moved the pinned
  corner). Internals went asymmetric: left zone = large `.figures` numeral + name
  eyebrow, hairline, display-face motto; full-height hairline divider; right zone =
  new 2–3-sentence prose description + the former dot-separated line converted to a
  real `<ul>` (`StackFeature` gained `description` prose and `bullets: string[]`).
  **Five distinct SRM-ordered tones** replace the old repeating tints: foam `bg-card`
  → `bg-lager` → `bg-marzen` (the interpolated step) → `bg-dubbel` → `bg-porter`,
  each with its own legible ink/foam text set (`CARD_TONES`). Mobile stays a plain
  list.
- **Footer**: CTA + brand copy left-aligned in a two-column grid; the right column
  is a new **inline** contact form (`components/footer-contact-form.tsx` — same
  fields/stub submit as `ContactDialog`, no dialog). **`NewsletterForm` deliberately
  removed and `newsletter-form.tsx` deleted** — it was a frontend stub only
  (`console.log` TODO; no backend endpoint ever existed, so nothing was orphaned
  server-side). The footer's second `ContactDialog` ("Contact Us" button) was
  replaced by the inline form; the CTA "Talk to us" `ContactDialog` remains.
  `rule-double` + dot-leader bottom line unchanged.
- **Navbar** (`landing-navbar.tsx`): standard auto-hiding header — slides away on
  scroll-down (>4px delta), returns on scroll-up, never hides within 80px of the
  top; rAF-throttled, cleanup on unmount, `motion-reduce:transition-none`. "Log in"
  label → **"Login"**.
- **Pricing modal** (`pricing-modal.tsx`): styling-only rework onto the token
  system — `max-w-5xl` + `p-8 md:p-12` (was cramped 4xl), eyebrow + display-face
  title, `rule-double`, brass `Check` icons (off-palette emerald removed), tier
  header set as the signature `name ····· $price` dot-leader row with `.figures`
  price, `bg-lager` "Most popular" chip. Tier data/copy and register links
  unchanged.
- **Heading sizes bumped** across landing sections: hero h1 → `text-5xl
  sm:text-6xl md:text-8xl` (`max-w-4xl`); info-section h2s → `text-4xl md:text-5xl`;
  social-proof h2 → `text-3xl md:text-4xl`; footer CTA h2 → `text-4xl md:text-5xl`;
  deck mottos → `text-3xl md:text-4xl`.

### Overview (Phase 2 refocus) & data sources

Greeting band (`Welcome in, {business}`) with count chips (reservations today, pending
requests, open tabs, queue waiting, items below par) and big figures (guests, orders,
revenue today), then a mosaic (weekly reservations chart, upcoming list, 7-day status
donut + cancellation rate, staffing-forecast tile). Data: the existing
`get_business_dashboard_stats` payload + **`ops`** — a module-gated, read-only
aggregation added in Phase 2 (`analytics_service.get_bar_ops_snapshot`, merged into
`GET /api/analytics/business/{id}`): orders/revenue today (business-timezone day start
via `order_service._business_day_start_utc`, non-cancelled orders), open tabs, waiting
queue entries, items below par. Keys appear only for enabled modules; frontend type is
`BusinessDashboardStats.ops?` in `client/lib/api-client.ts`. The old 3-slide carousel
is gone; its actions live on as the forecast tile + quiet action links (docs chat,
booking page). No new write paths, tables, or migrations.

### Schedule (Phase 2 rebuild)

Day-ledger layout (`business-schedule-client.tsx`): left rail = inline month calendar +
booking-type legend; main = `LEDGER_DAYS` (3) consecutive day rows with giant date
numerals, each listing that day's reservations (start–end from service-type duration,
fallback `business.reservationTime`) as cards → `ReservationDetailsDialog` unchanged.
Closed days render a "Closed on X" note (same operating-hours logic). The old
hour-grid timeline (and its px-positioning math) was intentionally retired.

---

## Future — Public-Facing Servings/Pours Display (Not Scheduled)

The staff-facing servings-remaining (menu items) and pours-remaining (bottles/kegs)
estimates could later be surfaced on the public menu — e.g. "only 3 left tonight"
urgency messaging. Not scheduled. Needs deliberate product/copy decisions before
building: what threshold triggers display (always show the count, or only below
some number?), how to phrase an estimate without implying false precision to a
customer, and whether this should be configurable per business rather than
always-on.

---

## Future — ID Verification (Not Scheduled)

Current age verification (Phase B.3) is self-attestation only: a checkbox plus a
staff-facing badge, no identity or age proof. A future pass could add real ID
verification — e.g. ID scanning/OCR, a third-party verification service, or
photo-ID capture at order time — for businesses that want stronger compliance
assurance than self-attestation provides.

Not scheduled. This is a materially bigger feature than the self-attestation
pass: it likely means a new vendor/service integration, real handling of
sensitive ID data (with corresponding privacy/compliance obligations that don't
exist today), and a genuinely different UX, not an extension of the current
checkbox. Scope this as its own project when picked up, not a checkbox
enhancement.

---

## Future — Table Registration for Tabs (Not Scheduled)

Bars will eventually be able to register their physical tables and attach one to
a tab when it's opened, alongside a party size — so an open tab reads as "Table 6,
party of 4" rather than an anonymous running total. The data layer is already
partly in place: the `tables` table + `Table` model exist as an **unused Phase 5.9
stub** (label, capacity, `qr_token_revision`, soft-delete), and `tabs.table_id`
already exists as a **nullable FK** to `tables` (wired into the original Tabs
schema in migration 016, but nothing reads or writes it yet).

What's net-new when this is picked up:

- A **table registration UI** (CRUD over the `tables` stub) — none exists today.
- `tabs` has **no `party_size` column** — that's a new nullable column (a small
  migration) when this lands.
- The **open-tab flow** (`tab-order-compose.tsx`'s parent + `POST /api/tabs`,
  which already accepts `table_id`/`customer_id` but the UI never sends) would
  add a registered-table picker + a party-size input.

Not scheduled. Keep it simple when picked up — a table picker and a party-size
integer, not a full floor-plan/seating-map feature (that's a much larger surface).
Follow the single-pass migration rule (Non-Obvious #29). Relates to the compose-UI
deferral in Non-Obvious #38 (table selection / party size on the compose UI).

---

## Backlog

### Phase 0 (Foundation) — All Complete

1. [DONE] Fix JWT claims: add business_id; update get_current_user to attach it.
2. [DONE] Add get_current_business dependency; audit all routers to use it.
3. [DONE] Add location_id (nullable) to reservations; create locations table.
4. [DONE] Add enabled_modules to businesses table.
5. [DONE] Implement require_module() dependency + integration test.
6. [DONE] Standardize error JSON format.
7. [DONE] Integration test: tenant isolation.
8. [DONE] Event envelope + publish() abstraction.
9. [DONE] Emit events from reservation create/update/delete.
10. [DONE] Document WebSocket connection model.
11. [DONE] Document permissions map.

### Phase 1 (Entitlements + Foundation) — All Complete

12. [DONE] GET /me/context endpoint.
13. [DONE] Frontend dynamic nav + route guards.
14. [DONE] Business onboarding wizard.
15. [DONE] Rich public business profile.
16. [DONE] Embeddable booking widget.
17. [REMOVED in 5.8] Google Calendar two-way sync.
18. [DONE] SMS/WhatsApp notification channel via Twilio.
19. [REMOVED in 5.8] Pricing/plan display page.
20. [REMOVED in 5.8] /for-businesses and /for-customers marketing pages.

### Phase 1.5 (Queue MVP) — All Complete

21–28. [DONE] Queue models, public join/leave API, staff management API, WebSocket channel, public join UI, staff queue board, SMS notification, in-app notifications.

### Phase 2 (Ordering) — All Complete

28–37. [DONE] Scaffold ordering module, menu models, staff menu management, public menu API, cart + order placement, order status + WebSocket, staff ticket board, customer order status page, item library, ordering toggle.

### Phase 3 (Inventory) — All Complete

38–44. [DONE] Migration, inventory_service, inventory router, frontend types, frontend API, inventory dashboard UI, sidebar nav entry.

### Phase 4 (Event Stream) — All Complete

45–52. [DONE] redis_client.py, events.py, ws_projections.py, stream_consumer.py, lifespan setup, queue router publish, ordering router publish, inventory router publish.

### Phase 5 (Insights) — All Complete

53–63. [DONE] get_reservation_kpis, get_ordering_kpis, get_inventory_kpis, get_high_risk_reservations, /kpis endpoint, /high-risk endpoint, api-client wrappers, frontend types, insights/page.tsx, insights-client OperationalKpisSection + high-risk list, overview OverviewCarousel with 3-day forecast slide.

### Phase 5.5 (Demo Hardening) — All Complete

64–75. [DONE] modules.ts, error pages, DashboardErrorBoundary, modules settings page, module-disabled guards, ModuleDisabled component, ConfirmationDialog replacements, account settings notification channels, overview loading.tsx, insights loading.tsx, EmptyState component, OpenGraph on reserve page.

### Phase 5.6 (UX Refinements) — All Complete

76. [DONE] Sidebar: per-module groups, Workspace always-visible, Queue ListOrdered icon.
77. [DONE] OverviewCarousel: merged StaffingHintCard + InsightsCarousel into 3-slide carousel.
78. [DONE] SSR slug→UUID: menu/[business] and order/[business] converted to server components.
79. [DONE] Customers in Workspace: VisitorResponse union endpoint, walk-in support.

### Phase 5.8 (Bar/Restaurant Refocus) — All Complete

80. [DONE] Remove Google OAuth/Calendar/Meet: delete service files, drop google_oauth_tokens table (migration 013), remove /google/authorize and /google/callback endpoints.
81. [DONE] Remove customer portal: delete /customer/ Next.js routes, remove /reservations/my + /reservations/customer/{id} + /analytics/customer/my backend endpoints.
82. [DONE] Simplify service types: drop is_online, requires_payment, amount, form_fields from model/schema/API/UI; delete FormFieldBuilder, DynamicField, PaymentStep components.
83. [DONE] Remove reservation payment stubs: drop payment_amount, payment_status, stripe_payment_intent_id, meeting_link, custom_fields from Reservation everywhere.
84. [DONE] Remove marketing pages: delete /pricing, /for-businesses, /for-customers pages and middleware rules.
85. [DONE] Simplify ReservationForm to 4 steps (type → datetime → info → success); add note field.

### Phase 5.9 (Multi-Channel Foundations) — All Complete

86. [DONE] Migration 014: create `customers`, `tables`, `bot_configs`; add nullable channel/customer_id/fulfillment_type/table_id/delivery_address/scheduled_for on orders; add channel + idempotency_key on reservations + queue_entries; add ordering_config + bot_enabled on businesses.
87. [DONE] SQLAlchemy models: Customer, Table, BotConfig.
88. [DONE] `customer_identity_service.upsert_customer` (phone-keyed upsert).
89. [DONE] `reservation_service` populates customer_id via upsert + stamps channel="web" on both auth + public paths.
90. [DONE] Migration 015 cutover: retarget reservations.customer_id → customers (NOT NULL), drop orphaned users.user_type='customer' rows.
91. [DONE] Rewrite `customer_service` (get_customers_by_business, get_all_visitors) against `customers` table; add `CustomerResponse` schema.
92. [DONE] Drop dead customer-portal code: notify*user, \_customer_patch_kind, CUSTOMER_RESERVATION*\* constants, get_customer_dashboard_stats, /analytics/customer/{me,id} endpoints, fetchCustomer + apiGetCustomer in frontend.
93. [DONE] Phase 5.8 cleanup gap: remove `requires_payment`/`is_online`/`amount`/`form_fields` references from service_type_service; remove `payment_status`/`payment_amount` from reservation_notifications.

### Phase 6 (Stations & Routing) — Planned

86. [ ] Migration: create `stations` table (id, business_id, name, color, is_active); replace routing_tag enum with station_id FK on menu_items.
87. [ ] Backend: stations CRUD router + service; update ordering router to use station_id.
88. [ ] Visual routing admin page: assign categories / items to stations.
89. [ ] Update ticket board to filter lanes by station assignment.

### Phase 7 (RBAC) — Planned

90. [ ] Migration: create `business_roles` table (id, business_id, name, permissions JSONB).
91. [ ] Backend: `require_permission()` dependency; roles CRUD router.
92. [ ] Predefined role templates: owner, manager, bartender, cook, host, server.
93. [ ] Platform admin scope (cross-business Crowbar superadmin).
94. [ ] Frontend: role management UI in staff/settings; role picker on invite flow.

### Phase 8 (Recipe Management & Inventory Sync) — All Complete (Phase B.4)

95. [DONE] Recipe builder UI per menu item: map ingredients + quantities via menu_item_ingredients (ml/oz toggle, functional).
96. [DONE] Auto-deduct inventory when order → "served" (best-effort, non-blocking; `movement_type='sale'`).
97. [DONE] Auto-disable menu items when any required ingredient hits ≤ 0 stock (manual re-enable).
98. [DONE] Low-stock warning badges on menu item cards (below-par ingredient → menu-item badge).
