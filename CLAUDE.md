# Crowbar — Claude Code Guide

## Project Overview

**Crowbar** is a multi-module operations platform for bars and restaurants.
The stack is a Next.js frontend + FastAPI backend + PostgreSQL + Redis, with a separate ML service.
All platform context, product direction, and phase history lives in this file.

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

# Run migrations with seed data (loads 001_seed.sql + 002_seed_puzzles.sql)
SEED_DATA=true python -m db.migrate

# Frontend only (from client/)
npm run dev

# Frontend in mock/demo mode — no backend needed (static mock data)
NEXT_PUBLIC_USE_MOCK_API=true npm run dev
```

**Default ports:** Frontend 3000 · Backend 8000 · ML 8001 · PostgreSQL 5432 · Redis 6379

**API docs:** http://localhost:8000/docs

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
│   │   └── seeds/             # 001_seed.sql, 002_seed_puzzles.sql (Puzzles Bar demo)
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

---

## Module Status

| Module         | Status               | Notes                                                                                                                                                                                                                                                                          |
| -------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `reservations` | Complete             | Core booking flow, staff management, analytics                                                                                                                                                                                                                                 |
| `queue`        | Complete (Phase 1.5) | Walk-in queue, WebSocket live board, SMS on call                                                                                                                                                                                                                               |
| `ordering`     | Complete (Phase 2)   | QR menu, cart, order placement (idempotent), kitchen/bar ticket board, WebSocket; item library (reusable templates, copy-on-add); ordering on/off toggle (`is_accepting_orders`); **tabs** (Phase B.1) — group orders under one running total, close with simulated settlement; **happy hour** (Phase B.2) — timezone-aware windows discount opted-in items on both the menu read and order placement paths; **age verification** (Phase B.3) — `is_alcoholic` menu flag drives a checkout self-attestation (server-re-validated via `age_confirmed`, channel-scoped) + an alcohol badge on staff tickets |
| `inventory`    | Complete (Phase 3)   | Stock items, movements (receive/adjust/waste), par levels, low-stock alerts; `menu_item_ingredients` recipe stub for future auto-deduction                                                                                                                                     |
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

10. **`menu_item_ingredients` is a stub — no order logic yet**
    The `menu_item_ingredients` join table (menu_item_id → inventory_item_id + quantity) exists as a FK scaffold for future auto-deduction on order placement. Nothing currently reads or writes it via the API. It exists so Phase 8 (Recipe Management) can wire recipes without a schema migration.

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

32. **Two seed files; `002_seed_puzzles.sql` is the rich demo tenant ("Puzzles Bar")**
    `SEED_DATA=true` loads both `001_seed.sql` and `002_seed_puzzles.sql`. Puzzles Bar is a craft-cocktail-bar tenant that exercises every module (reservations, queue, ordering, inventory, insights) and is the canonical dataset for demos and the mock layer.

33. **Customer-portal remnants fully removed**
    Phase 5.8 removed the `/customer/` routes and backend endpoints; the leftover dead components (`customer-sidebar.tsx`, `customer-sidebar-content.tsx`, `customer-floating-content.tsx`) and empty dirs (`client/app/business/people/`, `client/app/business/reservation-types/`) have now also been deleted. No customer-portal code remains. The active landing page uses `landing-navbar.tsx` + `pricing-modal.tsx` (pricing is a modal, not the removed `/pricing` page).

34. **Tabs are additive; tab total is computed on demand, settlement is simulated**
    A `tab` groups multiple discrete orders under one running total (Phase B.1). Orders with `tab_id = NULL` behave exactly as before — tabs replace nothing. `add_order_to_tab` is a thin wrapper over `order_service.place_order` that then stamps `tab_id` (no duplicated order-creation logic), and it publishes `order.placed` so tab orders still flow through the existing ticket board unchanged. The tab total is **never denormalized**: `tab_service.get_tab_total` is a live `SUM(orders.total_amount)` over the tab's **non-cancelled** orders (compute-on-demand, like `inventory_service.recompute_quantity_from_movements`). The `cancelled` exclusion is real, not defensive — `cancelled` is a genuine `orders.status` value (see the order-lifecycle note in Phase 2) reachable via the status-transition endpoint and enforced by a CHECK constraint in migration 008; a cancelled order must not count toward what's owed. Closing a tab is a status change + a `settled_method` (`cash|card|comp|other`) value — there is **no payment processing** behind it (deferred to Phase 10). `settled_method` is required to close. Closing an **already-closed** tab is rejected with **409** (router checks `status != "open"` before mutating, mirroring the add-order-to-closed-tab guard) so a double-click or retried request can't silently overwrite the original settlement record. The `/api/tabs*` router scopes tenancy via `get_current_business` (no `business_id` in the path), matching the core tenant-scoping convention rather than the ordering router's path-param style.

35. **Happy hour is timezone-aware and decided by ONE server-side function; day-of-week has a single canonical enum (Monday=0)**
    `happy_hour_service.is_happy_hour_active(db, business_id, at=None)` is the **single source of truth** for "is a happy-hour window active right now." It reads `businesses.timezone` (an IANA name), converts `at` (default `now()` in UTC) into that timezone with Python `zoneinfo`, then matches `local.weekday()` and `local.time()` against every `is_active` window. It is called in **exactly two places**, and they must stay identical so displayed and charged prices can't disagree: (a) the **public menu read** (`GET /api/ordering/{id}/menu`) stamps a transient `menu.happy_hour_active` bool that `MenuResponse` serializes — items carry their own `happy_hour_price`, so the client renders the discount from server-decided state, never from a local clock; (b) **order placement** (`order_service.place_order`) computes `hh_active` once and charges `item.happy_hour_price` (when set and active) instead of `item.price`. A window applies **business-wide**; an item opts in only by having a non-NULL `happy_hour_price` (flat override, not a percentage). `happy_hour_price` on `MenuItemUpdate` uses a **`model_fields_set`** check (not `is not None`) so a client can *clear* the discount by sending `null` while omission leaves it unchanged. **Day-of-week is standardized to one convention everywhere: 0=Monday..6=Sunday** — this matches Python `datetime.weekday()` so no offset math is ever needed. The single source is `server/app/constants/days.py` (backend) mirrored by `client/lib/days.ts` (frontend); both `analytics_service`, the onboarding wizard, the operating-hours settings, and the happy-hour day picker consume it. JS `Date.getDay()` (0=Sunday) must be converted via `jsDayToIndex()` before use. **Overnight windows are supported:** a window with `start_time <= end_time` is same-day (matches when the local weekday is listed and `start_time <= t <= end_time`); a window with `start_time > end_time` wraps past midnight and is active in two segments — on a listed day from `start_time` until midnight, and on the day *after* a listed day from midnight until `end_time` (keyed off `prev_weekday = (weekday - 1) % 7`). So a Friday 22:00–02:00 window is active Fri 22:00–23:59:59 **and** Sat 00:00–02:00, even though only Friday is listed in `days_of_week`. The staff create form allows `start > end`; it only rejects an identical start/end (a zero-length window).

36. **Age verification is self-attestation only, and the backend is authoritative — the checkbox is a formality, the staff glance is the real check**
    This is a speed bump plus a visual cue, **not** identity verification: no ID scan, no third-party service, no stored proof of age. `menu_items.is_alcoholic` flags an item. "Does this order contain alcohol" is **never stored** — it is derived on demand by `order_service.order_contains_alcohol(items)` (the single source of truth; accepts resolved `MenuItem` rows at placement or stored `OrderLineItem` rows at read, both carrying `is_alcoholic`). Order line items **snapshot** `is_alcoholic` at placement (like `routing_tag`/`unit_price`), so the staff alcohol badge survives later menu edits or item deletion (`item_id` is nullable). The attestation itself **is** persisted, but only as `orders.age_confirmed` on the order row — no session-level "already confirmed, skip next time" logic. **The backend re-validates, never trusting a client "box checked" flag:** `place_order` computes `order_contains_alcohol` from the resolved items and, when `require_age_confirmation` is set and the cart is alcoholic, raises `AgeConfirmationRequired` (→ 422) unless `request.age_confirmed` is true. **Channel scoping is structural, not a stored `channel` string:** the public order endpoint (customer self-service) calls `place_order` with the default `require_age_confirmation=True`; the tabs path (`tab_service.add_order_to_tab`, staff entering an order in person) passes `require_age_confirmation=False`. Those are the only two callers of `place_order`, so gating at the call site cleanly separates customer from staff without populating/reading `orders.channel`. **`businesses.legal_drinking_age` (default 18) is read for the checkout copy — no age is hardcoded** in logic or copy (different countries: 18 EU/Turkey, 21 US); it is editable on the Business Info settings page. The public order page pulls it from the resolved business and passes it to the checkout attestation ("I am at least N years old"). Frontend gates the Place Order button on the checkbox; the 422 is the safety net. **Deliberately NOT touched:** the item library carries no alcohol flag; only checkout/placement is gated (menu browsing is open); reservations/booking are unaffected.

---

## Key Files

| File                                                                     | Purpose                                                                                                                                        |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/app/dependencies.py`                                             | `get_current_user`, `get_current_business`, `require_module`                                                                                   |
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
| `client/app/business/tabs/tabs-client.tsx`                               | Tabs UI: open a tab, view associated orders + running total, close via settlement dialog                                                       |
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
| `server/app/services/inventory_service.py`                               | Inventory CRUD, movement logic, par breach → notification                                                                                      |
| `server/app/routers/inventory.py`                                        | Inventory REST endpoints (all behind `require_module("inventory")`)                                                                            |
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
| `client/app/business/orders/ticket-board-client.tsx`                     | Kitchen/bar live ticket board (order status lanes, WebSocket-driven)                                                                           |
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

**Frontend:** `client/app/business/tabs/` — loads the business's open tabs on mount (via `GET /api/tabs?status=open`, so they survive a refresh), open a tab, view associated orders + running total, close via a settlement-method dialog (not `confirm()`). Sidebar "Tabs" entry under the Ordering group.

**Deliberately out of scope (deferred):** split/guest-level attribution, real payment processing, and an add-order-to-tab compose UI (the endpoint exists; there's no menu/cart UI to drive it yet).

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

**Frontend:** checkout shows a self-attestation checkbox ("I am at least `{legal_drinking_age}` years old") **only** when the cart contains an alcoholic item, and gates the Place Order button on it. Ticket board shows an "Alcohol" badge on alcoholic line items (the real ID-check cue). Menu management has an `is_alcoholic` toggle per item; Business Info settings has an editable legal-drinking-age field. Seed (`002_seed_puzzles.sql`) marks Puzzles Bar drinks alcoholic so the flow is demoable.

**Resolved judgment calls (asked up front):** (a) line-item alcohol → **snapshot column** (robust to menu edits/deletion), not derive-by-join; (b) attestation → **stored on the order** (`age_confirmed`); (c) legal drinking age → **editable** in settings, not schema-only. **Deliberately out of scope:** ID scanning / OCR / third-party verification (see Future — ID Verification), cross-session attestation persistence, gating menu browsing (only checkout is gated), any reservation-flow change, and an alcohol flag on the item library.

### Post-B.3 — Google removal residue cleanup ✅ (most recent)

Finished the Google OAuth/Calendar/Meet removal that Phase 5.8 only did at the service/endpoint level (same find-everything-first method as the Slotera wipe). No schema changes — the `google_oauth_tokens` drop (migration 013) and the create→drop migration history (003/006/013) were already correct and are left intact as historical record.

Removed the surviving residue: `config.py` `google_client_id/secret/redirect_uri/connect_success_url` fields; `server/env.example` `GOOGLE_*` vars; the four unused `google-*` pip packages in `requirements.txt`; the stale `google_oauth_tokens` drop line in `migrate.py`'s dev `reset_database`; the landing-page "Google Calendar sync" module bullet + "calendar sync" copy (`page.tsx`); the `business-docs-chat-trigger` "connecting Google for Meet" example; a stale proxy-route comment; and the "Google Calendar API — Async Execution" backlog item. Rewrote the MDX docs (`managing-services`, `handling-reservations`, `making-a-reservation`, `managing-reservations`, `faq`) to drop Google Meet / online-video-service references, then regenerated `doc-chunks.json` (RAG source).

**Beyond pure Google (flagged, then cleaned in the same docs):** those MDX files also still documented other Phase-5.8-removed features — Stripe payment-at-booking, "online (video) service" types, `meeting_link`, and custom-form fields. Since they're documented-removed and the docs were actively wrong, they were cleaned in the same pass. **Separately flagged, NOT acted on:** the docs also claim **ICS calendar attachments / calendar invites** on confirmation emails, but no ICS-generation code exists in `email_service` and the `icalendar` dependency is unused — that's a separate unimplemented-feature gap, left for the user to decide.

**Justified remaining grep hits (all legitimate, not live Google integration):** `OAuth2PasswordBearer`/`oauth2_scheme` in `dependencies.py` (FastAPI JWT bearer, not Google); `next/font/google` in `layout.tsx` (Google Fonts / Geist); "Google Chrome" in the FAQ supported-browsers list; migrations 003/006/013 (historical create→drop record); and CLAUDE.md's own historical removal notes.

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

### Phase 8 — Recipe Management & Inventory Sync (Planned)

Wire the `menu_item_ingredients` stub into real functionality:

- Recipe builder UI per menu item: map ingredients + quantities
- Auto-deduct inventory when an order line item reaches "served" status
- Auto-disable menu items when any required ingredient hits zero stock
- Low-stock warning badges on menu item cards in the management UI

### Phase 9 — ML V2 (Planned)

Demand/stock forecasting using ordering + inventory signals. Reorder suggestions. Staffing hints from reservation + order demand patterns. Feedback mechanism (helpful/unhelpful) for ML recommendations.

### Phase 10 — Hardening + Optional Service Extraction (Planned)

Full permission audit + granular permission UI post-RBAC. Audit log exports. Rate limiting per tenant. Performance: caching for public routes, query optimization. Tracing (OpenTelemetry), SLO definitions. Extract services only with load evidence. Stripe integration for module subscriptions.

---

## Bars-Only Conversion Plan (Proposed — not yet started)

**Goal:** Narrow the product from a generic "bars and restaurants" serving-industry platform to an
**all-in-one operations platform for bars** (cocktail bars, pubs, nightlife venues). The architecture
already leans bar-friendly — `routing_tag` has a `bar` lane, the demo tenant (`002_seed_puzzles.sql`,
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

- [~] **Tabs**: DONE (Phase B.1, simplified) — a `tabs` table groups discrete orders under one running total, closed with a simulated `settled_method`. Additive (orders can still be standalone). Total computed on demand. **Not yet built:** GET list of open tabs, add-order-to-tab UI, split/guest-level attribution (all deliberately deferred — see Phase B.1 note).
- [x] **Age verification**: DONE (Phase B.3) — `is_alcoholic` flag on menu items drives a self-attestation checkbox on the ordering checkout (server-re-validated via `age_confirmed`; channel-scoped so staff/tab orders skip it) and an alcohol badge on staff order tickets. `businesses.legal_drinking_age` (default 18) is configurable and read for the copy — no age hardcoded. Ordering-only; self-attestation, not ID verification (see Future — ID Verification). **Deferred:** the door/queue age gate and door ID-check flag were not built (this pass is ordering checkout only).
- [x] **Happy hour**: DONE (Phase B.2) — business-wide `happy_hour_windows` (timezone-aware, day-of-week + wall-clock range) + a flat `menu_items.happy_hour_price` opt-in. One `is_happy_hour_active` function drives both the public menu display and order-placement pricing. Also landed `businesses.timezone` (IANA) and a single canonical day-of-week enum (Monday=0) shared front/back. Overnight (cross-midnight) windows are now supported (post-B.2 pass). **Deferred:** percentage/formula discounts, per-item schedules, promo notifications.
- [ ] **Pour/keg inventory**: unit types for spirits (bottle → oz/ml pours) and draft (kegs); wire into Phase 8 recipe deduction. Fold into / precede Phase 8 rather than duplicating it.

### Tier C — Nightlife Platform (larger — new surface)

- [ ] **Door management**: live occupancy vs capacity tracking; optional cover charge on the queue.
- [ ] **Guest list / VIP / comps** on reservations.
- [ ] **Keg level + line-cleaning reminders** (rides on the existing Celery beat scheduler).

**Notes for whoever picks this up:**

- Keep it simple; build only what a bar actually needs. Follow the single-pass migration rule (Non-Obvious #29) — no parallel columns / deferred cleanup.
- Tier B "pour/keg inventory" and Phase 8 (Recipe Management) overlap heavily; do them together.
- Payments/Stripe remain deferred (Phase 10), so Tabs close-out and cover charge are tracking-only until then.

---

## Future — Visual Redesign (Not Scheduled)

A pass to bring the customer-facing UI (public menu, order, reserve, queue pages — these
carry the most weight for guest-facing polish) up to a more premium, considered visual
standard: refined spacing, subtle motion/animation, stronger typographic hierarchy.

Not scheduled. Deliberately sequenced after Tier B stabilizes, since Happy Hour, Age
Verification, and Pour/Keg Inventory will each still be reshaping the same UI surfaces
(menu item cards, order flow) — restyling now means restyling twice.

When this is picked up: scope it to specific named screens, not "the whole app," and
provide concrete direction (an animation library, a spacing scale, 1-2 reference sites)
rather than a subjective bar like "award-winning" — vague visual-quality instructions
tend to produce generic polish (more padding, a fade-in) rather than an actually
distinctive result.

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

### Phase 8 (Recipe Management & Inventory Sync) — Planned

95. [ ] Recipe builder UI per menu item: map ingredients + quantities via menu_item_ingredients.
96. [ ] Auto-deduct inventory when order line item → "served".
97. [ ] Auto-disable menu items when any required ingredient hits zero stock.
98. [ ] Low-stock warning badges on menu item cards.
