# Working implementation plan — Crowbar MVP stages 3 and 4

> This is a working plan, not an authority document. `docs/TODO.md` owns scope
> and exit gates; `docs/MVP_ACCEPTANCE.md` owns risks and acceptance evidence.

## Summary and verified baseline

Implement stages 3 and 4 as one coordinated pass using migrations 038–040,
without redesigning the established area-based Floor board, table
combinations, registered-table QR flow, server-authoritative pricing/tax
snapshots, or order-linked inventory ledger.

Whole-order cancellation already exists from `received`, `preparing`, and
`ready` through the generic status transition. Stage 4 completes it with a
reasoned audit, served-order reversal, settlement locking, and an explicit
correction contract rather than introducing an unrelated cancellation path.

Stage 3 uses one migration because queue policy, reasoned lifecycle, waitlist
state, and generalized delivery attempts share constraints and must become
valid together. Stage 4 uses two migrations: ordering/station/ledger changes
in 039 and external-settlement history in 040, isolating the audit domains and
their lock/backfill risks.

## Ordered work units

### 1. Current-service queue policy and trustworthy estimate

- Add location-scoped `queue_service_days` and service-date ownership to queue
  entries in migration 038. Backfill using business timezone and service-day
  cutoff; an absent service-day row means closed.
- Add public service-state read and authenticated service-day read/write APIs.
  Closed/full joins return structured `409`; invalid capacity returns `422`.
- Serialize joins on the service-day row, cap `waiting|called` covers, and
  terminally close lingering older entries when a later day opens.
- Publish only measured estimates: latest 30 completed seatings within 30
  service days, minimum five samples, median rounded to five minutes.
- Add public closed/full/no-estimate/stale states and staff open/close/cap
  controls.
- Prove timezone/cutoff behavior and the final-capacity concurrency boundary.

### 2. Retry-safe walk-ins, reasoned transitions, truthful delivery

- Scope queue idempotency by business, add request fingerprints and an
  append-only queue event history, and generalize reservation delivery
  attempts to exactly one reservation, queue, or waitlist target.
- Require public join idempotency. Exact retries return the original response;
  conflicting reuse and duplicate active normalized phone numbers return
  `409` without exposing an existing management token.
- Add staff walk-in creation through the same capacity-safe service and replace
  staff deletion with `guest_left|no_show|staff_removed` reasoned removal.
- Commit `called` plus a pending delivery attempt before invoking SMS. Record
  delivered/failed separately, support retry, never resend delivered channels,
  and never claim notification without delivery evidence.
- Include delivery summaries in HTTP/WebSocket projections and reconcile on
  reconnect.

### 3. Complete future-waitlist lifecycle and delivery

- Extend the waitlist with declined/cancelled states, revision-bound management
  tokens, scoped idempotency, accepted-reservation linkage, terminal audit, and
  active/history/expiry indexes.
- Reject creation when any matching slot is available in the flexibility
  window. Preserve the 15-minute offer and normal reservation resource-claim
  contract.
- Add public manage/cancel/decline/retry-safe accept and staff active/history,
  reasoned removal, and delivery retry contracts.
- Commit pending email before sending, fall back to SMS only after email is
  failed/unavailable, and add a `SKIP LOCKED` expiry job. Reads and commands
  also resolve wall-clock expiry immediately.
- Cover token revision, exact retry, concurrent acceptance, acceptance versus
  decline, fallback delivery, tenant isolation, and expiry.

### 4. Stage 3 journey and reconnect consolidation

- Preserve the authoritative Floor board and the seating command as the only
  occupancy path. Queue status never creates seating, and planned assignments
  never occupy tables.
- Revalidate source state, combinations, readiness, capacity, and unique open
  seating under existing row locks; append queue events without adding an
  occupancy model.
- Exercise reservation, management, queue, schedule, and Floor surfaces at
  desktop/mobile widths with loading, empty, disabled, failure, stale, and
  reconnect behavior.
- Prove double-seat/overlapping-table conflicts, rollover, Berlin DST, module
  denial, and HTTP refetch after socket reconnect.

### 5. Tenant-configurable stations and line-level fulfillment

- Migration 039 adds archivable preparation stations, item station/shared
  routing, immutable line routing snapshots, line status/timeline, and exact
  line links on stock movements. Existing Kitchen/Bar routing becomes editable
  stations and `any` becomes shared.
- Add tenant-derived station CRUD, active-station validation, line-status
  commands, service-day all-day counts, dynamic filters, shared tickets, and
  independent line progression.
- Preserve the order placement body and idempotency. The order-level transition
  endpoint becomes a bulk operation; persisted order status is derived from
  lines.
- Entering/leaving `served` records/reverses line-linked stock movements;
  legacy unlinked movements retain order-level reversal behavior.
- Prove ownership, archive-in-use conflict, mixed-station aggregate state,
  line races, timing, inventory exactness, and WS/HTTP projection parity.

### 6. Audited corrections, cancellation, and authoritative 86 state

- Add append-only order revisions, reasoned cancellation audit, and item
  availability history in migration 039.
- Add idempotent full-cart correction before any line starts preparation,
  using current menu/modifier/price/tax authority without changing the original
  placement fingerprint.
- Move cancellation to a dedicated reasoned command. Allow it until external
  settlement, including served orders, while reversing only outstanding
  movements and cancelling active lines.
- Replace the toggle with an idempotent desired-state availability command.
  Inventory depletion uses the same service; recovery never auto-enables.
- Add accessible Correct/Cancel flows and one explicit available/86 control,
  with honest stale-cart rejection.

### 7. Audited external settlement, controlled reopen, live tabs

- Migration 040 maps `closed` to `settled_externally`, adds append-only
  settlement/reopen events and a current pointer, and backfills immutable
  non-cancelled totals. Legacy `comp` maps to informational `other` with its
  origin retained in the migration note.
- Replace legacy close with idempotent `settle-externally`; optional
  `cash|card|mixed|other` is informational only. Add owner/manager reopen with
  required reason and preserved settlement history.
- Serialize adding, correcting, cancelling, settling, and reopening on the tab
  lock. Settlement freezes economic contents; fulfillment may continue.
- Permit linked-tab reopen only while its seating remains open. Seating closure
  continues to reject an open tab.
- Add business-scoped tab invalidations, HTTP reconciliation on invalidation
  and reconnect, stale UI, immutable snapshot/history display, and compliant
  “Settle externally” copy.

### 8. Combined acceptance evidence and authority-document closure

- Add migrations 038–040 to fresh-database assertions.
- Walk reservation and public/staff queue sources through assignment, seating,
  QR/staff rounds, station fulfillment, exact stock deduction/reversal,
  external settlement, and seating closure; include waitlist acceptance.
- Inject optional Redis/WebSocket failure and prove committed state remains
  authoritative with HTTP reconciliation and no duplicate side effects.
- Run targeted suites, full PostgreSQL pytest, frontend lint/Vitest/build,
  TypeScript, fresh-database verification, Python compilation, and
  `git diff --check`.
- Only after the gates pass, update `docs/MVP_ACCEPTANCE.md`, mark stages 3–4
  complete in `docs/TODO.md`, and record durable decisions in
  `docs/HISTORY.md`.

## Sequencing and independent landing boundaries

1. Land 038 and aligned backend contracts, then queue policy, queue
   lifecycle/delivery, and waitlist lifecycle as separately testable units.
2. Close the stage-3 journey before enabling stage-4 behavior.
3. Land 039 station/line fulfillment before corrections and 86 behavior so
   audit/reversal rules operate against the final line/ledger model.
4. Review 040 independently, but accept it after 039 because settlement freezes
   the resulting tab contents.
5. Finish with combined evidence and authority-document updates. Deployment,
   full stage-7 seed expansion, and stages 5–7 are excluded.

## Exit-gate mapping

- Stage 3: units 1–2 close current-service policy, capacity, staff walk-ins,
  retry safety, reasons, measured estimates, and truthful delivery; unit 3
  closes the waitlist lifecycle; unit 4 proves convergence on exactly one real
  seating plus conflict, rollover, DST, and reconnect behavior.
- Stage 4: unit 5 closes configurable stations and independent fulfillment;
  unit 6 closes corrections, cancellation, authoritative 86, and inventory
  reconciliation; unit 7 closes tab locking, settlement, reopen, real-time,
  and seating closure; unit 8 supplies combined evidence.

## Deliberately out of scope

- Stages 5–7 implementation: purchasing/valuation, the permission/reporting/
  CRM/ML completion, seed expansion, Playwright release automation, CI, and
  the complete accessibility/load matrix.
- Payments, tenders or method amounts, partial/split settlement, change, tips,
  refunds, receipts, invoices, fiscal exports, bank settlement, deposits, and
  card holds.
- Floor geometry/drag-and-drop, automatic sections, richer meal stages,
  multi-location management UI, generic offline mode, a transactional outbox,
  and multi-replica WebSocket fan-out.

## Confirmed decisions and defaults

- Wait estimate is a measured median only and is omitted below five samples.
- Queue state is manually controlled per location/service day with a waiting-
  cover cap and no coupling to booking schedules.
- Items route to one active station or shared; legacy Kitchen/Bar become
  editable stations and legacy `any` becomes shared.
- Content corrections stop before preparation; reasoned cancellation remains
  available through served until external settlement.
- Reopen is owner/manager only, requires a reason, appends history, and is
  forbidden after linked seating closure.
- Settlement method is optional informational context, not a tender or amount.
- Economic tab contents freeze at external settlement; non-economic
  fulfillment may finish afterward.
- Migration numbers assume the prior tail is 037 and must remain append-only.
- No material product or architecture questions remain open.
