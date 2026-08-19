---
name: run-crowbar-service-loop
description: Drives Crowbar's real pilot journey end to end — book, assign, seat, order by QR or staff, fulfill, deduct stock, record external settlement, close the seating, inspect guest and cost history — as the definition of "verified". Use before claiming an operational feature works, when validating a change that crosses reservations/floor/ordering/inventory, or when the user asks to demo, walk through, or smoke-test the service loop.
---

# Run the Crowbar service loop

"The tests pass" is not the same claim as "a shift could run on this." This
skill is the second claim. The journey below is the supervised pilot's actual
loop; walking it is what makes a cross-module change verified.

Start the stack first: `./scripts/dev.sh` (frontend `:3000`, backend `:8000`,
ML `:8001`, PostgreSQL `:5432`, Redis `:6379`). It applies migrations and seeds
the demo tenant. It does **not** run scheduled jobs — see "What the stack does
not exercise".

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
   (`/reserve/manage`): reconfirm, reschedule, or cancel. *Proof:* the link is
   revision-bound — after a reschedule, the previous link is rejected.

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

Do not claim a step that cannot run. Verified gaps as of migrations 001–037:

- **Settlement is still simulated.** `POST /api/tabs/{tab_id}/close` records a
  `settled_method` label and closes the tab; `tab_service.py` says so in its own
  docstring. The audited `settled_externally` state with `settled_at`,
  `settled_by`, an immutable total snapshot, and an external-register reference
  is **stage 4 work that does not exist yet**. Walk step 9 as "close the tab",
  and report the shape gap rather than describing an audited assertion.
- **Preparation stations are hard-coded.** `orders.routing_tag` defaults to
  `kitchen`; tenant-configurable stations, station timing, and audited order
  edits/cancellation are stage 4.
- **Queue is not open/closed or capacity aware.** Staff-created walk-ins with
  reasons, duplicate protection, and wait estimates are stage 3.
- **Waitlist lifecycle is partial.** Offers and acceptance work; decline,
  cancel, expiry, removal, and active/history filtering are stage 3.
- **No purchasing.** Suppliers, purchase orders, receiving, stock counts,
  valuation, recipe cost, and margin are stage 5. "Inspect cost history" today
  means movements, discrepancies, and low-stock only.
- **No operational reports.** Stage 6.
- **`inventory.*` events have no WebSocket projection** — inventory changes do
  not push to a connected client.
- **The canonical seed does not contain the full stage 7 pilot scenario**, so a
  seeded database does not prove the complete demo journey.

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
