# Slotera — Claude Code Guide

## Project Overview

**Slotera** is a multi-module platform for service businesses (restaurants, salons, etc.).
The stack is a Next.js frontend + FastAPI backend + PostgreSQL + Redis, with a separate ML service.
See `docs/platform-evolution-plan.txt` for the full product vision and phase-by-phase roadmap.

---

## Dev Commands

```bash
# Start everything (Docker + FastAPI + Next.js)
./scripts/dev.sh

# Backend only (from server/)
source venv/bin/activate && uvicorn app.main:app --reload --port 8000

# Run migrations (from server/)
python -m db.migrate

# Run migrations with seed data
SEED_DATA=true python -m db.migrate

# Frontend only (from client/)
npm run dev
```

**Default ports:** Frontend 3000 · Backend 8000 · ML 8001 · PostgreSQL 5432 · Redis 6379

**API docs:** http://localhost:8000/docs

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui, Sonner (toasts) |
| Backend | FastAPI (Python), SQLAlchemy (async), Alembic-less custom migrator |
| Database | PostgreSQL (asyncpg driver) |
| Cache / real-time | Redis 7 |
| Auth | JWT (httpOnly cookie `rk-token`), FastAPI dependencies |
| Notifications | In-app (DB-backed) + Email (Resend) + SMS (Twilio, optional) |
| ML | Separate FastAPI service on :8001 (RFM segmentation, cancellation prediction, 7-day forecast) |

---

## Environment Setup

**Server** — copy `server/env.example` → `server/.env`
Key vars: `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, `RESEND_API_KEY`
Optional: `TWILIO_*` (SMS), `GOOGLE_CLIENT_*` (Calendar/Meet)

**Client** — copy `client/env.example` → `client/.env.local`
Key vars: `NEXT_PUBLIC_API_URL=http://localhost:8000`
Optional: `OPENAI_API_KEY` (docs RAG assistant)

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

| File | Contents |
|------|---------|
| `001_initial_schema.sql` | Core tables: users, businesses, staff, reservations, service_types |
| `002_ml_tables.sql` | ML output tables |
| `003_online_reservations.sql` | Online booking fields |
| `004_notifications.sql` | In-app notifications table |
| `005_locations_and_module_flags.sql` | Locations table, `enabled_modules` JSONB on businesses |
| `006_onboarding_notifications_calendar.sql` | Onboarding wizard state, notification channels, calendar tokens |
| `007_queue_entries.sql` | Queue entries table (Phase 1.5) |
| `008_ordering.sql` | Ordering tables: menus, categories, items, modifiers, orders, line items, status timeline |
| `009_item_library.sql` | Item library table (`item_library`) + `is_accepting_orders` boolean column on businesses |
| `010_inventory.sql` | Inventory tables: `inventory_items`, `stock_movements`, `menu_item_ingredients` (recipe stub) |

---

## Module Status

| Module | Status | Notes |
|--------|--------|-------|
| `reservations` | Complete | Core booking flow, staff management, analytics |
| `queue` | Complete (Phase 1.5) | Walk-in queue, WebSocket live board, SMS on call |
| `ordering` | Complete (Phase 2) | QR menu, cart, order placement (idempotent), kitchen/bar ticket board, WebSocket; item library (reusable templates, copy-on-add); ordering on/off toggle (`is_accepting_orders`) |
| `inventory` | Complete (Phase 3) | Stock items, movements (receive/adjust/waste), par levels, low-stock alerts; `menu_item_ingredients` recipe stub for future auto-deduction |
| `insights` | Partial | ML service runs; dashboard surfacing is Phase 5 |

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

6. **Item library copies, not links**
   Library items live in `item_library` (business-scoped). When "Add from Library" is used, the service copies the data into a new `menu_items` row — no FK back to the library. This is intentional: a live menu item must not silently change if a staff member edits the library template mid-service.

7. **`is_accepting_orders` blocks order placement at the API (503)**
   `PATCH /api/ordering/{business_id}/settings` toggles `businesses.is_accepting_orders`. The public `POST /api/ordering/{business_id}/orders` endpoint reads this flag and returns 503 if false. The customer menu page reads `GET /api/ordering/{business_id}/settings` (public, no auth) on load to show a banner and disable the cart checkout button client-side.

8. **Inventory `current_quantity` is denormalized**
   `inventory_items.current_quantity` is updated in-place on every `record_movement` call (not computed from `stock_movements` on read). `inventory_service.recompute_quantity_from_movements` provides a `SUM(quantity_delta)` helper for reconciliation/verification. `waste` movements always store a negative delta; the service negates the user-supplied value automatically.

9. **`alert_triggered` on `stock_movements`**
   When a movement causes `current_quantity < par_quantity`, the movement row's `alert_triggered` is set `true` and `notify_business_staff` fires with `kind="inventory_low_stock"`. The movement row itself serves as the audit record of when and why an alert was sent — no separate alerts table.

10. **`menu_item_ingredients` is a stub — no order logic yet**
    The `menu_item_ingredients` join table (menu_item_id → inventory_item_id + quantity) exists as a FK scaffold for future auto-deduction on order placement. Nothing in Phase 3 reads or writes it via the API. It exists so Phase 5/6 can wire recipes without a schema migration.

5. **Migration rename preamble (one-time)**
   Migrations 005 and 006 were renamed after being applied. The `_migrations` table was updated manually. If restoring from a backup that has the old names, run:
   ```sql
   UPDATE _migrations SET filename = '005_locations_and_module_flags.sql'
     WHERE filename = '005_phase0_foundation.sql';
   UPDATE _migrations SET filename = '006_onboarding_notifications_calendar.sql'
     WHERE filename = '006_phase1.sql';
   ```

---

## Key Files

| File | Purpose |
|------|---------|
| `server/app/dependencies.py` | `get_current_user`, `get_current_business`, `require_module` |
| `server/app/services/notification_service.py` | In-app + SMS + email dispatch |
| `server/app/services/queue_service.py` | Queue join/call/seat/remove logic |
| `server/app/services/queue_ws_manager.py` | In-memory WebSocket connection manager |
| `server/app/routers/queue.py` | Queue REST + WebSocket endpoints |
| `client/lib/client-api.ts` | All frontend API calls (auth + public) |
| `client/hooks/use-queue-socket.ts` | WebSocket hook (fetches token from `/api/ws-token`) |
| `client/app/api/ws-token/route.ts` | Server route: reads httpOnly cookie, returns JWT for WS auth |
| `client/components/notification-trigger.tsx` | Bell icon + notification panel + toast deduplication |
| `server/app/routers/ordering.py` | Ordering REST + WebSocket endpoints |
| `server/app/services/menu_service.py` | Menu/category/item/modifier CRUD |
| `server/app/services/order_service.py` | Order placement (idempotent), status transitions |
| `server/app/services/order_ws_manager.py` | In-memory WebSocket manager for orders |
| `client/hooks/use-order-socket.ts` | WebSocket hook for live ticket board |
| `server/app/services/inventory_service.py` | Inventory CRUD, movement logic, par breach → notification |
| `server/app/routers/inventory.py` | Inventory REST endpoints (all behind `require_module("inventory")`) |
| `client/app/business/inventory/inventory-management-client.tsx` | Inventory dashboard UI |
| `client/middleware.ts` | Public route declarations |
| `docs/platform-evolution-plan.txt` | Full product roadmap |
