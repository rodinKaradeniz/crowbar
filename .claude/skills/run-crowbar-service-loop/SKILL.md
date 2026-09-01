---
name: run-crowbar-service-loop
description: Drives Crowbar's real pilot journey end to end — book, assign, seat, order by QR or staff, fulfill, deduct stock, record external settlement, close the seating, inspect guest and cost history — as the definition of "verified". Use before claiming an operational feature works, when validating a change that crosses reservations/floor/ordering/inventory, or when the user asks to demo, walk through, or smoke-test the service loop.
---

# Run the Crowbar service loop

"The tests pass" is not the same claim as "a shift could run on this." This
skill is the second claim. The journey below is the supervised pilot's actual
loop; walking it is what makes a cross-module change verified.

Start the stack first: `./scripts/dev.sh` (frontend `:3000`, backend `:8000`,
ML `:8001`, PostgreSQL `:5432`, Redis `:6379`). It applies migrations but does
**not** seed: seeding is gated behind `SEED_DATA=true` and it otherwise logs that
it left demo data alone. Seeding replaces the demo tenant, so it is a data
mutation the user authorizes, not a step you take to make a walk convenient. It
also does **not** run scheduled jobs — see "What the stack does not exercise".

## When to use

- Before reporting a reservations, floor, ordering, inventory, or tabs change
  as done
- When a change crosses two or more of those modules
- When the user asks for a demo walkthrough, smoke test, or "does this actually
  work end to end"

## When NOT to use

- Single-layer changes with no operational surface (a mapper, a lint fix, docs)
- Writing the feature itself — use `full-stack-architect` for that, then come
  back here to verify

## The loop

Walk it in order. Each step names the surface and what proves it happened.

1. **Book.** Public `/reserve/[business]` (requires the business-level
   `public_reservations_enabled` flag) or the staff dialog from
   `/business/reservations` or `/business/schedule`. Slots come from the
   server in the venue timezone — the form must submit a returned absolute
   timestamp, never a browser-constructed one. *Proof:* the reservation
   persists `ends_at` and the server-selected allocation.

2. **Manage as the guest.** Open the signed management link
   (`/reserve/manage`): reconfirm, reschedule, or cancel. The token is exchanged
   for a capability cookie at `POST /api/public/capabilities/exchange` before the
   manage routes will read it. *Proof:* the link is revision-bound — cancel, then
   confirm the same token is refused at the exchange. A **reschedule does not**
   revoke it, deliberately: the guest who just rescheduled would otherwise lose the
   link they are holding. `docs/PRODUCT.md` is the authority — links "expire when
   the reservation is cancelled or no-showed".

3. **Assign.** `/business/floor` host board. An assignment is **planning**, not
   occupancy; multi-table allocations must match an active configured
   combination. *Proof:* the table is planned but still shows as available for
   walk-ins.

4. **Seat.** Open a `table_seating` from the Floor table-selection sheet — this
   is also the only staff path that seats a queue party. *Proof:* the tables
   become occupied and the board's HTTP snapshot (`GET /api/floor-plan/board`)
   reflects it. The board re-fetches on `floor_plan_updated`; the socket
   message is an invalidation, never state.

5. **Order — QR.** Scan the table's opaque credential
   (`GET /api/floor-plan/tables/{table_id}/qr`) and place a round at
   `/order/[business]` → `POST /api/ordering/{business_id}/orders`. *Proof:*
   the order resolves prices from the tenant's own menu, the tax snapshot is
   written to each line, and the round joins the seating's single open tab.
   Rotate the QR (`POST .../qr/rotate`) and confirm the old credential now
   fails.

6. **Order — staff.** Add a round from `/business/tabs` or the Floor → Tabs
   handoff. *Proof:* both rounds share one tab and one total.

7. **Fulfill.** Move the order to `served` from `/business/orders`. *Proof:*
   the order WebSocket projection updates, and `sale` stock movements appear.

8. **Deduct stock.** `/business/inventory` →
   `GET /api/inventory/{business_id}/items/{item_id}/movements`. *Proof:* the
   ledger shows the deduction and `current_quantity` matches it. Reverse the
   `served` status and confirm the `sale_reversal` comes from the recorded
   movements, **not** from re-reading the current recipe. An item depleted to
   zero is auto-disabled and stays disabled until staff re-enable it.

9. **Settle externally.** Record that the venue's separate register completed
   settlement. *Proof:* the tab closes and the copy says **settled
   externally** — never "paid" or "payment processed". See the gap in step 9
   below before writing this up.

10. **Close the seating.** `POST /api/floor-plan/seatings/{seating_id}/close`.
    *Proof:* a seating with an open tab is **rejected**; after settlement it
    closes, completes the source visit, and returns tables to ready.

11. **Inspect history.** `/business/customers` for the guest timeline
    (reservations, queue, tabs, orders projected from the operational records,
    not a duplicate ledger), and `/business/inventory` discrepancies and
    low-stock for the cost side.

## What is not implemented today

Do not claim a step that cannot run.

> Re-verified against source at migration 049. The settlement, station, queue and
> waitlist bullets that used to sit here were stale — all four described gaps
> that stages 3 and 4 had already closed — and have been removed rather than
> carried forward. What follows is what genuinely does not exist.

- **Purchasing and cost control ship as of migration 048.** Suppliers, supplier
  products with lead times, purchase orders, partial receiving, pack
  conversions, count sessions with CSV round-trip, purchase-price history,
  attachments, valuation, recipe cost, margin, pour cost, consumption variance
  and controllable COGS are all reachable. "Inspect cost history" now means the
  movement ledger plus `/api/inventory/{business_id}/cost-control` and its
  margins, variance and cogs sub-resources.
- **Location transfers do not exist and are not coming for the pilot.** The
  schema in migrations 046/047 is dormant and no route reaches it. Do not walk a
  transfer step; see the deferred entry in `docs/TODO.md`.
- **Reports ship as of stage 6**, at `/business/reports` and `/api/reports/*`.
  Bookings and no-shows, queue wait and seating conversion, table utilization and
  turn time, ordered items by station with ticket timing, the three separate
  ordered / open-tab / externally-settled value figures, stock movement and
  waste, purchasing spend, and staff actions — each over a chosen date range,
  each with a CSV export. Reading a report and reconciling it against the ledger
  by hand is now part of walking the loop. **No fiscal or accounting report
  exists and none is coming**; do not describe any figure as revenue.
- **Staff actions reporting is not an audit log.** It reports over the actor
  columns that already exist — who approved a purchase order, reconciled a
  count, recorded a settlement, marked a no-show. A platform-wide audit explorer
  is deferred; do not claim one.
- **`inventory.*` events have no WebSocket projection** — inventory changes do
  not push to a connected client.
- **The seed now carries the physical layer** as of stage 8 part one: a primary
  location, three areas, twenty tables, two active combinations, the Bar and
  Kitchen stations, assignments, a live queue and waitlist, an open seating with
  an open tab, and a closed seating settled externally. Steps 3–11 are walkable on
  seeded data. What is still missing is the automated browser journey and the CI
  that runs it — stage 8 parts two and three.

## Which role can walk which step

Since stage 6 the loop is role-aware, so "it worked" depends on who you were.
The seed provides one account per role — `owner@`, `manager@`, `host@`, `bar@`
and `inventory@example.com`. The domain matters: a reserved special-use TLD such
as `.invalid` is rejected by the email validator, so those accounts could not sign
in (`docs/HISTORY.md`, 2026-08-26). `docs/permission-matrix.md` is generated from
`server/app/core/permissions.py` and is the authority; the short version:

| Step | Role that owns it |
| --- | --- |
| Book, reschedule, mark a no-show | host / server |
| Run the queue, seat a party, close a seating | host / server |
| Take and fulfill an order, 86 an item | bar / kitchen, host / server |
| Open a tab, record external settlement | bar / kitchen, host / server |
| Reopen a settled tab | manager |
| Count stock, receive a delivery, draft an order | inventory operator |
| Approve a purchase order | manager |
| Read cost, margin or any report | manager |
| Configure tables, menus, prices, stations, staff | manager |

Walking the whole loop as an owner proves the workflow, not the matrix. To claim
the matrix works, sign in as each role and confirm that what it can reach
matches its row **and** that a direct API call to something it lacks returns
403 — the UI hiding a control is not the boundary, the server is.

## What the stack does not exercise

`./scripts/dev.sh` runs no scheduled jobs. Reminder delivery, retention
anonymisation, and inventory reconciliation only happen when you run them:

```bash
cd server
venv/bin/python -m app.jobs.reservation_reminders     # mutates data, may send email/SMS
venv/bin/python -m app.jobs.customer_retention
venv/bin/python -m app.jobs.inventory_reconciliation
```

Optional services degrade rather than fail: Redis loss makes the rate limiter
fail open and drops event publishing (the committed HTTP mutation still
succeeds), and email/SMS/ML are failure-tolerant. If one was down during your
walk, say which.

## Reporting

State the steps you actually drove, the surface used for each, and the steps
you skipped with the reason. "Loop verified" without that list is an
overclaim — `docs/RULES.md` treats it as one. Anything genuinely blocked goes
to `docs/TODO.md` under its owning stage, not into a fresh section.

## Reference

`docs/TODO.md` stages 3–7 (what remains and each exit gate),
`docs/ARCHITECTURE.md` (Operational tables and seatings; Authoritative order
placement; Inventory and order fulfillment), `docs/PRODUCT.md` (vocabulary:
assignment vs seating, external settlement), `docs/MVP_ACCEPTANCE.md` (route
inventory and evidence contract).
