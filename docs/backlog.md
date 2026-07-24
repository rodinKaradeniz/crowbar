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

**Stripe integration** — infrastructure is partially in place:
- `requires_payment`, `payment_amount`, `stripe_payment_intent_id` columns exist on `reservations`
- `PaymentStep` component scaffolded in `client/components/payment-step.tsx`
- `send_payment_receipt` placeholder in `server/app/services/email_service.py`

Deferred from Phase 1 to keep the onboarding wizard simple and avoid PCI scope.

---

## Staff Invitations

**Invite-by-email flow** — currently staff are linked directly to a user account with no invite-token mechanism.
Business owners cannot invite staff who don't already have an account. A token-based invite email flow is needed.

---

## WhatsApp Notifications

Deferred from Phase 1 (SMS only via Twilio was implemented instead).
The `notification_channels` JSONB column on businesses is already multi-channel ready — adding `"whatsapp"` as a channel value is a backward-compatible extension.

---

## Reviews System

A reviews placeholder exists on the public profile page (`/reserve/[slug]`).
Needs:
- `reviews` database table (business_id, customer_id, rating, body, created_at)
- Moderation flag (hidden by default until approved)
- Backend endpoints: POST, GET (paginated), DELETE (owner)
- Frontend: form on the public page + list display

---

## E.164 Phone Number Normalization

SMS delivery via Twilio requires E.164 format (`+1xxxxxxxxxx`).
Currently `sms_service.send_sms()` returns `False` for any number that doesn't start with `+`, but no normalization is attempted.
A normalization step at reservation creation time (using a library like `phonenumbers`) would improve reliability.

---

## SMS Reminder Deduplication — Resolved

Migration 011 added `sms_reminder_sent`, and the one-shot reminder job marks
successful deliveries. This historical item is retained only to explain the
deduplication field.

---

## Multi-Location UI

The database schema supports multiple locations per business (`locations` table, referenced in `MeContext.business.locations`).
No UI exists yet for creating/managing locations, or for filtering reservations/schedules by location.

---

## Onboarding Redirect Hardening

The onboarding redirect (`business.onboardingComplete === false → /business/onboarding`) is only enforced on the `/business/overview` page.
Other authenticated business pages (e.g. `/business/staff`, `/business/schedule`) do not check this flag.

**Partially resolved (Phase 5.5):** Module pages (inventory, queue, menu, reservations, insights) now check `business.enabledModules` server-side and show a `<ModuleDisabled>` fallback — so they fetch the full business already. Adding an `onboardingComplete` check alongside would be trivial for those pages. The remaining gap is non-module pages (`/business/staff`, `/business/schedule`, `/business/customers`, `/business/requests`, `/business/profile`).

Consider a middleware-level check or a shared server component guard for full coverage.

---

## Widget CSP / frame-ancestors Hardening

Currently `Content-Security-Policy: frame-ancestors *` is set on all `/reserve/*` routes, allowing any site to embed the booking form.
For production, this should be locked down to a known allowlist of customer domains, or replaced with a per-business allowed-origins configuration.

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

## Staff Admin Role Cleanup

The `Staff.role` type includes `"staff_admin"` (a legacy value) alongside the current `"owner" | "manager" | "staff"` hierarchy.
Once all staff records are migrated to the new role scheme, `"staff_admin"` should be removed from the TypeScript type and the backend schema.
