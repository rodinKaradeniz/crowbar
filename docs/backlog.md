# Crowbar — Deferred Work Backlog

> **Legacy ledger:** This file contains historical deferred work and is not the
> current roadmap. Several entries below have already shipped or were removed.
> Use `docs/TODO.md` for current plans, and verify any item here against source,
> migrations, and `docs/HISTORY.md` before acting on it.

Historically, items were added here when explicitly deferred from a phase
rather than dropped entirely. Reconcile unresolved items into `docs/TODO.md`
instead of extending this file.

---

## Role Switcher (Dual-Role Accounts)

**Users who own a business AND make reservations at other businesses** currently need two separate accounts (one `staff`, one `customer`). The role switcher would let a single account hold both roles and switch context from the dashboard header.

**Phase 1.5 interim fix shipped:** notifications from linked accounts (same email) are merged into a single notification panel, tagged by source type.

Full role switcher requires:
- DB: `user_roles` junction table linking one `users` row to multiple `(business_id, role)` pairs, replacing the current `user_type` enum split
- Auth: JWT needs to encode the *active context* (which role/business the user is currently acting as), with a `POST /auth/switch-context` endpoint that issues a new short-lived token
- Frontend: role switcher UI in the dashboard header (dropdown showing "Business: X" / "Customer mode"); each switch re-fetches `meContext` and re-renders the shell
- Migration: existing staff + customer rows with the same email must be merged at the DB level — requires a deduplification job

**Why:** eliminates the awkward dual-account experience for business owners who also use the platform as customers. Until this ships, the email-unified notification panel covers most of the pain.

---

## Payments

**Historical only:** migration 013 removed the earlier payment data stubs. The
confirmed MVP records only that a tab was **settled externally** after the
venue uses its separate compliant register. Payment collection, receipts,
refunds, deposits/card holds, TSE, and DSFinV-K now belong to the post-MVP
German fiscal POS/payment program in `docs/TODO.md`. Do not revive these legacy
stubs as an MVP shortcut. Unused payment-provider packages were removed during
Stage 1.

---

## Staff Invitations — Resolved

Stage 1 added hashed expiring single-use tokens, pending visibility,
revoke/resend and duplicate handling, role validation, and truthful delivery
state. `docs/TODO.md` Stage 6 retains only the broader permission/audit matrix.

---

## WhatsApp Notifications

Deferred from Phase 1 (SMS only via Twilio was implemented instead).
The `notification_channels` JSONB column on businesses is already multi-channel ready — adding `"whatsapp"` as a channel value is a backward-compatible extension.

---

## Reviews System

The unauthoritative public placeholder was removed in Stage 1. A future real
reviews system would need:
- `reviews` database table (business_id, customer_id, rating, body, created_at)
- Moderation flag (hidden by default until approved)
- Backend endpoints: POST, GET (paginated), DELETE (owner)
- Frontend: form on the public page + list display

---

## E.164 Phone Number Normalization

**Shipped:** Stage 1 removed historical US-default parsing. Stage 2 now stores
an ISO country per tenant and normalizes business, reservation, waitlist, and
queue phone input to E.164 through that country's numbering plan. Country
selection and address text remain editable rather than hard-coded to Germany.

---

## SMS Reminder Deduplication — Resolved

Migration 036 added channel-specific attempt, delivery, error, and retry state.
The migration-011 `sms_reminder_sent` field remains compatibility aggregate
state rather than the authoritative deduplication mechanism.

---

## Multi-Location UI

The database schema supports multiple locations per business (`locations` table, referenced in `MeContext.business.locations`).
No UI exists yet for creating/managing locations, or for filtering reservations/schedules by location.

---

## Onboarding Redirect Hardening — Resolved

Stage 1 added a shared business-route guard and explicit server page checks for
retained module and non-module dashboard routes.

---

## Widget CSP / frame-ancestors Hardening — Resolved for MVP

Reservation pages default to `frame-ancestors 'self'`. Deployment may provide
exact HTTP(S) embedding origins through `RESERVATION_FRAME_ANCESTORS`; wildcard
values are rejected. Per-business origin management remains optional future
breadth.

---

## Celery Async Pool Configuration — Resolved by Removal

Celery was removed when Railway became the deployment target. Reservation
reminders now run as a short-lived hourly Railway Cron process; see
`docs/HISTORY.md` and `server/app/jobs/reservation_reminders.py`.

---

## Sidebar Queue Count — WebSocket

The sidebar Queue nav item currently polls `GET /api/queue/{id}/entries` every 30 seconds to show the active party count. This is wasteful when the staff member also has `/business/queue` open (two polling loops). The cleaner solution is to reuse the existing `useQueueSocket` hook — or a shared context — to push the count update whenever a `queue_updated` WebSocket message arrives, eliminating the poll entirely.

**Why deferred:** requires lifting queue WebSocket state out of the board page into a shared provider (e.g. a `QueueContext`).

---

## Custom Ordering Stations (Routing Tags)

Currently routing tags are hard-coded to `kitchen | bar | any`. Each tag maps to a fixed column on the staff ticket board.

Full customization requires:
- DB: `routing_stations` table (id, business_id, name, color)
- Backend: replace the `VARCHAR(20)` value-check on `menu_items.routing_tag` with a FK to `routing_stations`; update ordering router to return station list
- Frontend: station management UI in Menu settings; ticket board columns rendered dynamically from the station list instead of the hard-coded Kitchen/Bar pair

**Why deferred:** hard-coded kitchen/bar covers the restaurant demo case. Generalizing to arbitrary stations adds schema complexity before the use case is validated beyond restaurants.

---

## Staff Admin Role Cleanup — Resolved

Stage 1 constrains the frontend, backend schema, and database to the
`owner | manager | staff` hierarchy.
