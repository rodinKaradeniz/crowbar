# Project History and Decisions

This is the durable, agent-neutral decision log. It is not a changelog of every
commit. Add a dated entry when a decision constrains future implementation,
when a failure teaches a reusable lesson, or when project direction materially
changes. Keep one decision per entry with context, decision, consequences, and
references; update the stable summaries only when their underlying decision
changes.

## Product and Repository Milestones

- **2025-12-16:** Repository began as a Create Next App project.
- **2026-01-25:** Initial application baseline landed.
- **2026-02-20 to 2026-02-21:** Frontend mock mode and demo data were added so
  the product can render without a live backend.
- **2026-03-31:** RK Reservations was renamed to Slotera.
- **2026-07-02:** Slotera was renamed to Crowbar and the product refocused on
  bar and restaurant operations.
- **2026-07-03 to 2026-07-06:** Happy hour, age verification, liquid
  inventory, recipes, fulfillment-linked stock movements, status history,
  waste reasons, and reference pour estimates landed through migrations
  017–022.
- **2026-07-23:** A cross-agent documentation contract was introduced:
  root `AGENTS.md` orchestrates stable architecture, rules, history, TODO, and
  skills documents.
- **2026-07-24:** A pre-development confirmation gate was added. Agents must
  surface material unknowns and compare credible modern solution shapes before
  implementing an open product, UX, or architecture choice.
- **2026-07-24:** The legacy `CLAUDE.md` phase archive was retired after its
  current design, architecture, migration-recovery, and open-work contracts
  were moved into agent-neutral documentation.
- **2026-07-25:** Operator-oriented product research was reconciled into the
  roadmap. It reinforced the operational-loop order and added dependency-aware
  work for shift operations, self-service booking changes, bar-native counts,
  workforce economics, offline survival, retention, and provider-neutral
  integrations without promoting those ideas ahead of availability.
- **2026-08-13:** The first release was reframed as a supervised, non-fiscal
  operational pilot for a single-location German bar. The roadmap now has an
  explicit stages 0–9 local-to-pilot sequence, while payment and German fiscal
  POS work remain a separate post-MVP program.
- **2026-08-14:** MVP stage 0 closed with an authoritative route disposition,
  workflow ownership trace, risk register, and stage 1–7 acceptance matrix in
  `docs/MVP_ACCEPTANCE.md`. Known audit defects now have numbered stage owners.
- **2026-08-14:** MVP stage 1 closed locally with the complete frontend,
  PostgreSQL backend, reproducible ML, and fresh migration/seed gates passing.
  Germany-ready tenant and operational tax configuration was the next boundary.
- **2026-08-14:** MVP stage 2 closed locally with country-neutral tenant region
  configuration, owner/manager-controlled effective tax profiles, immutable
  order tax snapshots, and migration 037. Stage 3 guest-to-table completion is
  the next boundary.

## Durable Decisions

### Development starts after product-shape confirmation

**Decision:** Agents may investigate first but must not silently fill material
requirements or implement an unresolved solution shape. When the user suggests
one possible pattern, the agent compares relevant alternatives, recommends a
direction with tradeoffs, and obtains confirmation. A clear, explicit
instruction is already confirmed and should not trigger redundant ceremony.

**Consequences:** Clarification happens before code, schema, dependency, or
external changes. Questions focus on answers that could change the result.
Agents are expected to improve the option set—not merely choose between the
first examples named—while leaving the final product decision with the user.

### A business is the tenant

**Decision:** Protected operations derive the active business from the
authenticated staff association. A business ID in a path can identify a
resource but cannot authorize access.

**Consequences:** Every tenant-owned query requires business scoping. New
modules use `get_current_business`; role and module checks are dependencies.
Multi-business active context requires a future auth redesign rather than
loosening this rule.

### Modules are enforced at API and page boundaries

**Decision:** Reservations, queue, ordering, inventory, and insights are
independently enabled entitlements.

**Consequences:** Module routes use `require_module(...)`; staff pages render
the shared disabled state. Navigation hiding alone is never enforcement.

### Authentication uses a Next.js BFF

**Decision:** FastAPI issues a JWT that Next.js stores in the `rk-token`
httpOnly cookie. Browser-side authenticated requests pass through the Next.js
proxy. WebSockets obtain a token through `/api/ws-token`.

**Consequences:** Client JavaScript never reads the main JWT. Middleware claim
decoding is only an early navigation gate; FastAPI remains authoritative.

### Public humans and authenticated users are separate identities

**Decision:** `customers` is business-scoped and phone-keyed. It is not the
same model as `users`.

**Consequences:** All customer writes go through
`customer_identity_service.upsert_customer`. Dual-role account behavior cannot
be solved by casually joining these identities.

### SQL migrations are ordered and forward-only

**Decision:** Crowbar uses a custom migrator with filename tracking in
`_migrations`, not Alembic.

**Consequences:** Add a new migration for change or correction. Do not alter an
applied migration. Integration tests create ORM metadata and therefore do not
prove the SQL migration chain by themselves.

### Redis Streams decouple mutations from WebSocket projections

**Decision:** Queue and order mutations commit first, then publish a
best-effort domain event. The FastAPI lifespan consumer re-queries current
state and broadcasts it through in-memory managers.

**Consequences:** A Redis failure may drop a live update without rolling back
the mutation. A transactional outbox and shared multi-replica fan-out remain
future hardening work.

### Time uses business timezone and Monday=0

**Decision:** Business wall-clock behavior uses the configured IANA timezone.
Day indices are Monday=`0` through Sunday=`6`, matching Python
`datetime.weekday()`.

**Consequences:** Backend code uses `server/app/constants/days.py`; frontend
code uses `client/lib/days.ts`. JavaScript's Sunday-based day index must be
converted at the boundary.

### Pricing is server-authoritative

**Decision:** Happy-hour eligibility is determined by one timezone-aware
server function and order placement revalidates price and alcohol rules.
Frontend cart logic is shared by public ordering and staff tab composition.

**Consequences:** Display state and submitted prices cannot be trusted.
Alternative order-entry surfaces must reuse the standard placement path.

### Money crosses the API as JSON numbers

**Decision:** `AppBaseModel` serializes `Decimal` values as JSON numbers and
frontend mappers use `toMoney()` / `toOptionalMoney()`.

**Consequences:** New monetary schemas inherit `AppBaseModel`; new mappers use
the shared coercion rather than local `Number(...)` patterns.

### Liquid inventory is stored in milliliters

**Decision:** `bottle` and `keg` are presentation categories over identical
ml-based storage and movement math. Recipe quantity uses each linked
inventory item's native unit.

**Consequences:** Crossing between `each` and liquid types is blocked while
recipes reference an item. UI oz support converts to ml before API submission.

### Fulfillment effects are ledger-based and best-effort

**Decision:** Entering `served` records recipe deductions as order-linked
`sale` movements. Moving one step backward from `served` reverses the
outstanding actual movements with `sale_reversal`.

**Consequences:** Reversal stays correct if a recipe later changes and repeated
serve/unserve cycles net correctly. Inventory failure does not block service
status. Auto-disabled items require manual re-enable.

### Derived operational values remain derived

**Decision:** Tab totals, menu servings remaining, and reference pours
remaining are computed from authoritative state rather than stored.

**Consequences:** Do not add denormalized copies without a measured performance
need and an explicit consistency strategy.

### Item-library entries are copied templates

**Decision:** Adding an item-library entry to a menu creates an independent menu
item. There is no live foreign-key relationship back to the template.

**Consequences:** Editing a reusable template cannot change an active menu
without an explicit menu edit. Future bulk-sync behavior would require a new,
confirmed product contract.

### Inventory balances are maintained and reconcilable

**Decision:** `inventory_items.current_quantity` is updated in the same domain
operation that writes each stock movement. Normal reads use that maintained
balance; the movement ledger can recompute it for reconciliation.

**Consequences:** New inventory write paths must update the balance and ledger
together. A reconciliation mismatch is an integrity incident, not a reason to
silently switch every read to aggregation.

## 2026-07-24 — Railway is the deployment target and ML stays private

**Context:** Crowbar needs a low-operations initial deployment without
splitting the Next.js frontend, FastAPI gateway, ML process, PostgreSQL, Redis,
scheduled work, and uploads across unrelated platforms. The ML API previously
accepted browser calls and loaded global reservation/customer data.

**Decision:** Deploy the Crowbar topology in one Railway project in EU West.
Next.js and FastAPI are the public services; PostgreSQL, Redis, ML, scheduled
work, and file storage remain private. FastAPI is the authenticated insights
gateway: it derives the business from staff context and passes that ID plus a
shared service credential to tenant-scoped ML endpoints. ML loaders require a
business predicate and in-memory results are keyed per business.

**Consequences:** The browser never receives an ML address. Next.js uses a
server-only `API_INTERNAL_URL` for normal BFF/server traffic while
`NEXT_PUBLIC_API_URL` remains available for direct browser WebSockets. Future
domain microservices stay private behind the stable FastAPI gateway. Raw ML
result durability across process restarts remains separate production
hardening work.

**References:** `server/app/routers/insights.py`, `ml/src/main.py`,
`ml/src/db.py`, `client/lib/ml-api.ts`

## 2026-07-24 — Scheduled reminders use a Railway Cron job

**Context:** Celery existed only to schedule one hourly reservation-reminder
task. No request path queued work, so deploying an always-on worker and beat
would add two idle processes and a second scheduling system.

**Decision:** Production invokes the reminder sweep as a short-lived Railway
Cron service at `0 * * * *` UTC. The shared Python module owns the job and exits
after closing its database engine. Celery is removed; Redis remains the domain
event stream.

**Consequences:** Scheduled work must be safe as a one-shot process and expose
failures through its exit status and logs. If Crowbar later needs queued,
retryable, or high-throughput asynchronous work, choose a worker/queue design
for those requirements rather than putting scheduling back into the API.

**References:** `server/app/jobs/reservation_reminders.py`,
`server/railway.reminders.json`

## 2026-07-25 — Public API abuse controls use Redis rolling windows

**Context:** Authentication and unauthenticated guest endpoints had no
application-level request ceilings. Crowbar needs useful protection without
penalizing many guests behind venue Wi-Fi or turning a Redis incident into an
ordering and reservation outage.

**Decision:** FastAPI applies Redis-backed rolling-window policies to login,
registration, invite acceptance, public reservations, queue mutations, public
orders, and related public reads when `RATE_LIMIT_ENABLED=true`. Limits combine
generous per-IP ceilings with tighter identity or business-scoped keys where
appropriate. Every key component is HMACed before Redis storage, Redis supplies
the shared clock, Railway's `X-Real-IP` is trusted only in production, and
blocked requests use the standard `RATE_LIMITED` response plus `Retry-After`.
The limiter logs and fails open when Redis is unavailable.

**Consequences:** Every API replica shares the same counters without storing
raw email addresses, phone numbers, IPs, or session tokens in rate-limit keys.
Redis protects but does not become a hard dependency for guest transactions.
The Next.js docs assistant remains a separate abuse-control task because its
requests do not pass through FastAPI.

**References:** `server/app/core/rate_limit.py`,
`server/tests/integration/test_rate_limit_redis.py`,
`server/tests/integration/test_rate_limit_routes.py`

## 2026-07-25 — Product work follows the operational loop

**Context:** Crowbar has working reservation, queue, ordering, inventory, tabs,
customer, and insight foundations, but key operational concepts are not yet a
single coherent loop. In particular, reservation settings are stored without a
server-authoritative availability engine, and later table, CRM, cost, and
payment work could otherwise create competing concepts.

**Decision:** Product development proceeds in this order: authoritative
availability and capacity; floor plan and tables; rich guest CRM; no-show and
reservation protection; purchasing and cost control; then POS and payment
integrations. Existing roadmap items are merged into the applicable stage, and
later planned improvements remain after this sequence unless explicitly
reprioritized.

**Consequences:** Availability is designed for later resource/table assignment,
guest identity remains business-scoped and phone-keyed, purchasing/ML work
shares one cost model, and POS/payment work starts with integrations rather
than silently expanding into terminal hardware or a complete POS.

**References:** `docs/TODO.md`, `server/app/models/business.py`,
`server/app/models/service_type.py`, `server/app/services/reservation_service.py`

## 2026-07-25 — Railway rollout is intentionally shelved

**Context:** PostgreSQL, Redis, and FastAPI are online in Railway EU West, while
the web, ML, reminders, storage, and the local rate-limit deployment remain.
The user wants time to observe Railway and prioritize product functionality.

**Decision:** Preserve the verified three-service Railway state and stop the
rollout until the user explicitly resumes it.

**Consequences:** Agents may inspect or document the deployment but must not
provision, configure, deploy, or delete Railway resources as part of unrelated
work. The precise resume point remains in `docs/deployment.md` and
`docs/TODO.md`.

**References:** `AGENTS.md`, `docs/deployment.md`, `docs/TODO.md`

## 2026-07-25 — Bookable time is separate from operating hours

**Context:** Public operating hours do not fully describe when a venue accepts
reservations. A venue may remain open after its last seating, use split or
overnight booking windows, offer different availability for a booking type, or
close bookings for a particular date without changing its published hours.

**Decision:** Keep operating hours as public venue information and introduce a
separate server-authoritative booking schedule. The schedule has business
defaults, optional service-type overrides, multiple and overnight windows,
date-specific exceptions, and minimum-notice rules. Initial schedules are
derived from existing operating hours to avoid empty availability after the
cutover.

**Consequences:** Public, staff, future bot, and later table-allocation flows
must use the availability service rather than infer slots from operating hours.
Changing published hours does not silently rewrite an intentionally customized
booking schedule; the product must offer an explicit copy/synchronize action if
that behavior is desired.

**References:** `docs/TODO.md`, `server/app/models/business.py`,
`server/app/models/service_type.py`

## 2026-07-26 — Availability foundation persists schedules and occupied intervals

**Context:** The confirmed availability contract needed a forward-compatible
database shape before slot computation, conflict locking, endpoints, or UI
could share one source of truth. Existing businesses only had public operating
hours, nullable service concurrency, and reservation start timestamps.

**Decision:** Migration 023 adds one default booking schedule per business and
optional complete service-type overrides, with multiple/overnight weekly
windows and date-specific closures or custom hours. Existing valid operating
hours seed the default; no configured hours means no availability. Legacy NULL
`max_concurrent_bookings` values become `1`. Reservations persist `ends_at`
plus optional override actor, reason, and timestamp; current writes derive the
end from service duration or the business fallback until the availability
service owns that decision.

**Consequences:** Later availability consumers must use the schedule tables and
stored reservation intervals rather than reinterpret operating hours or
current duration settings. Service-specific schedules cannot cross tenants at
the database layer. Migration 023 remains local while deployment is shelved,
and the current API still needs slot calculation, transaction locking,
conflict responses, override authorization, and UI integration.

**References:** `server/db/migrations/023_booking_availability_foundation.sql`,
`server/app/models/booking_schedule.py`, `server/app/models/reservation.py`,
`docs/TODO.md`

## 2026-07-26 — Reservation creation claims server-authoritative slots

**Context:** Persisted schedules and reservation intervals did not prevent a
browser, bot, or competing request from submitting an invalid or stale time.
The public form also fabricated nine browser-local time choices without
checking venue policy or occupancy.

**Decision:** A shared availability service resolves a service override or the
business default and returns only absolute bookable intervals grouped by
business-local date. Weekly and exception windows are allowed start-time
ranges with an exclusive end; overnight spill remains owned by its service
date. Public and authenticated creation lock the resolved schedule row with
`SELECT ... FOR UPDATE`, recompute availability, and persist the accepted
start/end interval. A stale request returns `SLOT_UNAVAILABLE` with at most five
alternatives. The public form consumes this API and never constructs its own
booking timestamp.

**Consequences:** Concurrent creates for one schedule serialize and the second
request observes the first committed booking. Pending and confirmed rows
consume service concurrency; cancelled rows do not. New businesses are closed
until their booking schedule has windows. Staff rescheduling, explicit
owner/manager overrides, and schedule-management APIs/UI remain separate next
slices. Migration 023 and this code remain local while Railway deployment is
shelved.

**References:** `server/app/services/availability_service.py`,
`server/app/routers/availability.py`, `server/app/services/reservation_service.py`,
`client/components/reservation-form.tsx`, `docs/TODO.md`

## 2026-07-26 — Booking schedules are managed explicitly and inherit by deletion

**Context:** The authoritative availability engine had no authenticated
management surface. Legacy business timing fields did not own slot generation,
service concurrency was not editable, and service-type mutations could resolve
records outside the authenticated tenant.

**Decision:** Add tenant-scoped schedule read/replace/delete APIs and a Profile
→ Booking editor with Policy, Weekly Hours, and Date Exceptions tabs. A service
override is a complete schedule initialized from the current business default;
reverting deletes it after confirmation. Copying operating hours requires a
preview and replaces only the default weekly windows once. Owners/managers may
mutate schedules, booking types, and the business party limit; ordinary staff
can inspect them read-only. Service-type mutations now derive tenant scope from
authentication, and Booking Types exposes positive concurrency.

**Consequences:** Published operating hours and booking availability remain
independent after an explicit copy. A service without an override always sees
future default changes, while an override does not partially inherit. API and
UI consumers must preserve these semantics. Atomic rescheduling is now the next
availability slice; reason-recorded privileged overrides remain separate.

**References:** `server/app/routers/booking_schedules.py`,
`server/app/services/booking_schedule_service.py`,
`client/app/business/profile/booking/business-booking-client.tsx`,
`docs/TODO.md`

## 2026-07-28 — Staff rescheduling claims replacement capacity atomically

**Context:** The staff Edit dialog accepted arbitrary browser-local date/time,
and generic reservation PATCH recalculated an end time without checking the
authoritative schedule or concurrency. A failed or concurrent move could not
provide the same guarantees as reservation creation.

**Decision:** Introduce authenticated reservation-specific availability and a
dedicated reschedule command for future pending/confirmed reservations. Lock
the tenant-scoped reservation, validate the requested slot under the resolved
schedule lock while excluding that reservation, then update booking type,
party size, start, and end in one transaction. Keep general PATCH limited to
contact, note, and status fields. Replace the free-form date/time editor with a
shared server-slot dialog on Reservations, Requests, and Schedule. Commit the
move and staff notification before updated email/ICS, configured SMS, and the
best-effort domain event.

**Consequences:** A rejected or stale move leaves the original capacity claim
unchanged. Cancelled, completed, and past reservations are terminal for this
flow, and terminal records cannot be reactivated through generic PATCH.
Ordinary staff remain constrained by normal availability. Privileged,
reason-recorded overrides and guest-token self-service remain separate work.

**References:** `server/app/services/reservation_service.py`,
`server/app/routers/reservations.py`,
`client/components/reschedule-reservation-dialog.tsx`, `docs/TODO.md`

## 2026-07-28 — Staff bookings use one audited allocation path

**Context:** Crowbar could move existing reservations through authoritative
availability, but the dashboard had no host-desk creation flow. Its unused
authenticated create client sent a browser-selected business ID, and managers
could not record exceptional bookings outside normal availability even though
migration 023 contained override audit fields.

**Decision:** Use one shared staff booking dialog for creation and
rescheduling. Authenticated creation and availability derive the tenant from
the current staff assignment. Ordinary staff use normal server slots only.
Owners/managers may explicitly request server-generated, venue-timezone
override times and must provide a reason. The override path bypasses schedule
policy and concurrent occupancy only; service ownership, module entitlement,
future time, slot alignment, duration, and party limits remain hard rules.
Store and return the actor, reason, and timestamp and identify overrides in
staff notifications and reservation details.

**Consequences:** Phone and host-desk bookings now receive the same capacity,
customer identity, confirmation, and event behavior as other staff mutations.
Public guests cannot override availability, and ordinary staff cannot reveal
or submit override times. A normal later reschedule clears the current override
marker. Planned operating changes still belong in schedule exceptions rather
than repeated one-off overrides.

**References:** `server/app/routers/reservations.py`,
`server/app/services/availability_service.py`,
`client/components/staff-reservation-dialog.tsx`, `docs/TODO.md`

## 2026-07-28 — Operational tables separate planning from occupancy

**Context:** Crowbar had a QR-oriented table record, but reservations and queue
parties could not use it, order entry still trusted free-form table labels, and
business creation did not guarantee the primary location expected by the
multi-location foundation. Storing a single editable table status would also
conflate planned reservations, real occupancy, and temporary service
conditions.

**Decision:** Guarantee and backfill one primary location per business. Extend
registered tables with areas, shapes, positive capacity, and explicit
ready/cleaning/out-of-service conditions. Permit multi-table allocations only
through active configured combinations. Store reservation and queue assignments
separately from actual seatings; closing a seating completes the visit and
moves its tables to cleaning. Enforce capacity by default and allow only
owners/managers to override it with a recorded reason. Keep configuration
owner/manager-only while allowing all staff to run the service loop.

**Consequences:** Public booking capacity remains authoritative and does not
require a table assignment at creation time. The first host board can derive
planned, occupied, cleaning, and unavailable views without depending on a POS.
The next slice must replace legacy queue seat actions in the UI, then connect
registered tables to tabs and revisioned QR ordering before removing new
free-form table writes.

**References:** `server/db/migrations/024_operational_tables.sql`,
`server/app/services/floor_plan_service.py`,
`server/app/routers/floor_plan.py`, `docs/TODO.md`

## 2026-07-28 — Local Compose uses a repository-specific project name

**Context:** Docker Compose inferred the project name `server` from the backend
directory. Another local repository used the same inferred name, causing Docker
to group an unrelated stopped database with Crowbar and making broad Compose
commands affect both projects.

**Decision:** Declare `name: crowbar` in Crowbar's Compose file. Recreate the
Crowbar PostgreSQL, Redis, and ML containers under that project and copy the
database and Redis volumes to the corresponding `crowbar_*` names before
startup verification.

**Consequences:** Normal Compose commands from this repository now target the
Crowbar stack without relying on the generic directory name. Existing local
installations changing from the older project name must preserve or migrate
their named volumes rather than allowing Compose to initialize empty ones.

**References:** `server/docker-compose.yml`, `docs/ARCHITECTURE.md`

## 2026-07-28 — Host boards use service-day snapshots and socket invalidation

**Context:** The operational-table foundation could assign and seat parties,
but staff had no single read model for a shift. Calendar dates are also a poor
boundary for venues operating after midnight, and returning the primary JWT
through the Next.js WebSocket-token route exposed an httpOnly credential to
browser JavaScript.

**Decision:** Add a configurable business-local service-day cutoff, defaulting
to 05:00, and make one tenant/location-scoped HTTP board the authoritative
projection for tables, assignments, seatings, reservations, and queue parties.
Publish floor-plan events only after commit and use reservation/queue events to
invalidate a dedicated staff socket; clients re-fetch the board rather than
merging socket-owned state. FastAPI now issues a 120-second, business-bound
WebSocket credential. Next.js exchanges the primary cookie-backed token
server-side, and normal HTTP authentication rejects the scoped credential.

**Consequences:** Shift boundaries remain correct across midnight and DST,
socket loss degrades to ordinary HTTP refetch, and the main access token never
reaches browser JavaScript. Legacy location-null parties are visible only at
the primary location while new reservation and queue writes set that location
explicitly. The next slice owns the responsive host-board/configuration UI and
removal of table-less queue actions when their callers migrate.

**References:** `server/db/migrations/025_service_day_cutoff.sql`,
`server/app/services/floor_plan_service.py`,
`server/app/routers/floor_plan.py`, `server/app/services/websocket_auth.py`,
`client/app/api/ws-token/route.ts`

## 2026-07-29 — Documentation is governed by one owner per concern

**Context:** Crowbar already had detailed current-state, architecture,
decision, roadmap, design, and skills-strategy documents, but it lacked a
dedicated product rulebook and a compatible pointer for tools that begin with
`CLAUDE.md`. Agents could otherwise discover product behavior by piecing it
together from technical and planning documents.

**Decision:** Keep `AGENTS.md` as the current-state entry point and
`RULES.md` as procedural authority. Add `PRODUCT.md` for product vocabulary,
behavior, invariants, scope, and exclusions; make `CLAUDE.md` a pointer only;
and document the ownership map in `docs/README.md` and
`docs/PORTABLE_AGENT_SETUP.md`. Existing architecture, history, roadmap,
design, and skills-strategy documents retain their owners.

**Consequences:** New work reads a consistent, task-sized sequence and updates
the document that owns the changed fact. Local skills remain deliberately
absent until a real repeated Crowbar workflow justifies one; generic workflow
files are not added merely to mirror another repository.

**Superseded in part on 2026-08-25:** the one-owner-per-concern principle
stands, but `docs/README.md` and `docs/PORTABLE_AGENT_SETUP.md` were deleted;
`AGENTS.md` is now the sole ownership map. See the 2026-08-25 entry.

**References:** `AGENTS.md`, `CLAUDE.md`, `docs/RULES.md`,
`docs/PRODUCT.md`, `docs/SKILLS.md`, `docs/TODO.md`

## 2026-07-29 — Queue seating always creates actual table occupancy

**Context:** The queue board could previously mark a party accepted or seated
without selecting a registered table. That contradicted the operational-table
model: a queue assignment is only a plan, while an open seating owns actual
occupancy and later moves its tables to cleaning.

**Decision:** Add the shared Floor workspace and table-selection sheet. It
uses the authoritative host-board snapshot and opens a floor-plan seating for
either a reservation or queue party. The Queue page retains notification and
no-show actions but routes both waiting and notified parties through that same
seating command. The legacy table-less queue accept/seat HTTP and client paths
are removed.

**Consequences:** A party cannot become seated without a real table allocation.
The host board remains the operational source of truth, with socket messages
only invalidating its HTTP projection. Table configuration remains
owner/manager-only, while all staff can carry out seatings and table-state work.

**References:** `client/app/business/floor/`,
`client/components/floor-plan-seating-sheet.tsx`,
`client/app/business/queue/queue-board-client.tsx`,
`server/app/routers/floor_plan.py`, `server/app/routers/queue.py`

## 2026-07-29 — Public booking access is distinct from staff reservation work

**Context:** Venues need to choose whether their public reservation URL accepts
guests or whether the host team keeps the reservation book staff-only. Closing
booking hours was an inadequate substitute because it obscured the venue's
intent and did not reliably protect the public mutation path.

**Decision:** Store `public_reservations_enabled` on the business, expose it to
owners/managers in Profile → Booking, and enforce it on public availability and
public reservation creation. Keep authenticated staff availability, creation,
table planning, and seating independent. The public page shows a
contact-the-venue state when disabled. Existing businesses backfill enabled.

**Consequences:** A venue can pause online booking without interrupting host
operations, and a caller cannot bypass the choice by posting directly to the
public API. The setting is business-wide rather than a per-service or
per-table policy; revisit that granularity only with a confirmed product need.

**References:** `server/db/migrations/026_public_reservation_access.sql`,
`server/app/services/availability_service.py`,
`client/app/business/profile/booking/`,
`client/app/reserve/[business]/`

## 2026-07-29 — Availability is backed by real venue resources

**Context:** The prior availability model limited overlapping reservation
records, not actual cover capacity or physical tables. It could accept a party
that had no viable table, while forcing all venues—including standing bars—to
pretend they used a floor plan.

**Decision:** A booking type now chooses legacy compatibility, shared
cover-backed availability, or table-backed availability. Cover-backed services
consume an explicit pool of reservable covers. Table-backed services choose and
persist the smallest viable registered table/configured combination, then use
stable table locks to recheck the claim at creation or reschedule time. A
service-level turn buffer extends resource occupation after the planned end;
the exact release boundary remains bookable. Existing types keep their legacy
count guard until an owner configures the policy, and onboarding asks how the
first service holds capacity. Guest-facing booking never exposes table choice.

**Consequences:** Public and staff availability now agree with real capacity
when configured, while table-free venues remain supported and existing venues
are not silently assigned guessed capacity. Future table planning no longer
fails merely because a table is occupied right now. Closing a seating returns
tables to ready by default; the retained `cleaning` storage state is an
optional staff-controlled “needs reset” signal rather than a compulsory step.

**References:** `server/db/migrations/027_resource_aware_reservation_availability.sql`,
`server/app/services/availability_service.py`,
`server/app/services/reservation_service.py`,
`server/app/services/floor_plan_service.py`,
`client/app/business/profile/types/`,
`client/app/business/onboarding/`

## 2026-07-29 — Registered tables own the dine-in tab and QR journey

**Context:** The original ordering flow accepted a guest-typed table label,
while the tab model's table reference was not validated or linked to a real
visit. That permitted orders that could not be tied to an occupied table and
made departure independent of an unpaid tab.

**Decision:** Keep legacy labels for historical display, but require new public
dine-in orders to carry a server-signed, revision-bound registered-table QR
credential. It resolves only for an active seating. Add a nullable seating
link to tabs and enforce one open tab per seating; QR and staff rounds reuse
it. Owners/managers can rotate a table QR revision. A seating cannot close
while its tab remains open, so staff settle before recording departure.

**Consequences:** Multi-table seatings share one tab through the seating rather
than selecting an arbitrary primary table. The Floor board is the staff entry
point for starting/opening tabs, while the Tabs surface handles orders and
settlement. QR credentials become invalid after rotation, table archival, or
the end of the seating. No public client can create a new free-text table
assignment by posting directly to the API.

**References:** `server/db/migrations/028_seating_tab_qr_continuity.sql`,
`server/app/services/table_qr_service.py`, `server/app/services/tab_service.py`,
`server/app/services/floor_plan_service.py`, `client/app/business/floor/`,
`client/app/order/[business]/`

## 2026-07-30 — Guest CRM favors useful service context over compliance theatre

**Context:** The operational loop needed a durable guest profile before
no-show protection and retention automation, but a proposed allergy workflow
would have required every staff member to acknowledge a warning. Queue walk-ins
also still produced synthetic visitor rows despite the established phone-keyed
customer identity.

**Decision:** Build one business-scoped guest profile from authoritative
reservation, queue, tab, order, and note records. Phone-bearing queue joins
now upsert the canonical customer. Keep visit requests on the visit by default;
staff can retain dietary information only when the guest has asked them to do
so, which records provenance without a separate guest-facing consent ritual.
Floor presents the resulting allergy/dietary information and tags as passive
arrival context. Use optional staff-profile DOB, separate unchecked public
email/SMS marketing choices, manager-only merge/export/anonymisation actions,
and a default 24-month inactivity anonymisation policy. The venue is controller
and Crowbar processor for this EU/Germany-oriented initial contract.

**Consequences:** No automatic marketing or identity verification is implied,
and no persistent allergy is inferred from a staff assumption. Historical
operations remain available in anonymous form after erasure. The retention job
is a one-shot process until deployment scheduling is explicitly resumed.

**References:** `server/db/migrations/029_guest_crm_and_privacy.sql`,
`server/app/services/customer_service.py`, `server/app/jobs/customer_retention.py`,
`client/app/business/customers/`, `docs/PRODUCT.md`, `docs/TODO.md`

## 2026-07-31 — Reservation protection records operations before it charges guests

**Context:** The reservation loop could hold capacity and send a basic reminder,
but guests could not change a booking without contacting staff and a missed
arrival was indistinguishable from a cancellation. The product needed useful
host controls without inventing payment or punitive automation before POS work.

**Decision:** Put late-change, grace, reminder, and reconfirmation settings in
the existing complete booking-schedule default/override model. Keep guest
cancellation and rescheduling available until start time, recording late
changes instead of blocking them. Make no-show a staff action after grace,
with optional note. Use revision-bound signed guest links rather than an
account or staff JWT. Model the future waitlist separately from today's queue,
with one host-issued 15-minute offer and an atomic availability recheck on
acceptance. Defer deposits, holds, fees, blacklists, and automatic penalties.

**Consequences:** Cancellation and no-show state immediately release the same
capacity and table resources as any other terminal reservation. Venues can
tune policy globally or for a specific booking type without partial policy
inheritance. Guest and waitlist links are invalidated by their record revision,
and reminder delivery stays transactional rather than marketing-based.

**References:** `server/db/migrations/030_reservation_protection.sql`,
`server/app/services/reservation_service.py`,
`server/app/services/reservation_waitlist_service.py`,
`server/app/jobs/reservation_reminders.py`,
`client/app/reserve/manage/`, `client/app/business/profile/booking/`

## 2026-07-31 — Waitlist offers stay within the guest's explicit flexibility window

**Context:** The protection backend could create and accept a future waitlist
entry, but had no operational surface. A host needs to review the actual
request and make an offer only after availability is current; a guest needs a
simple fallback when their selected date is already full.

**Decision:** Show a public waitlist path only after live availability returns
no slots. The guest supplies a preferred venue-local time and a 30-, 60-, or
90-minute later flexibility window. In Reservations, staff can add requests,
review active entries, and choose only a freshly fetched, server-approved slot
within that window. Sending the offer retains the existing one-guest,
15-minute-expiry and atomic acceptance behavior.

**Consequences:** The browser never estimates capacity or converts a selected
time using the staff member's timezone. A daylight-saving local time that does
not occur is rejected before submission. An issued offer is not a reservation
until the guest accepts it.

**References:** `client/components/reservation-form.tsx`,
`client/components/reservation-waitlist-panel.tsx`,
`client/lib/availability.ts`, `client/lib/client-api.ts`

## 2026-08-13 — The first pilot is operational, externally settled, and non-fiscal

**Context:** A codebase audit found that Crowbar already has valuable
reservation, floor, ordering, inventory, CRM, and insight foundations, but
production payment and German cash-register compliance would introduce a
separate domain involving tenders, receipts, TSE, DSFinV-K, refunds, and fiscal
retention. Pulling that work into the first pilot would delay proving the bar's
core service and stock workflows. The first known venue is a single-location
bar in Germany, Railway is the intended deployment target, and the user wants
complete local verification before resuming deployment.

**Decision:** Target a supervised MVP pilot in which Crowbar owns the
non-fiscal operational record from reservation through queue, tables, orders,
inventory, purchasing, cost control, guest context, and reporting. The venue's
separate compliant register remains payment and fiscal authority. Crowbar
records an audited **settled externally** assertion with a total snapshot and
optional informational method/reference; it does not process payment, model
partial tenders, or issue receipts/invoices. Purchasing includes suppliers,
purchase orders, receiving, invoice/reference capture, stock counts, and cost
analysis but not supplier-invoice payment. German tenant configuration uses
EUR, locale/timezone/country-aware contact handling, and effective-dated
per-item tax profiles for operational estimates; it is not a fiscal tax
engine. The existing area-based Floor board is sufficient for the pilot.

Development follows the confirmed order in `TODO.md`: contract/baseline;
correctness/security; Germany configuration; guest-to-table; ordering/external
settlement; stock/purchasing/cost; staff/CRM/reporting; local demo/release gate;
Railway; supervised rollout. Deployment remains a separately authorized
external action after the local gate.

**Consequences:** Product copy, schemas, analytics, and staff actions must not
call Crowbar's external assertion a processed payment or authoritative
revenue. Tax-rate changes must not rewrite historical order estimates. Payment,
cash, tips, split/partial tenders, refunds, deposits/card holds, fiscal receipts,
TSE, DSFinV-K, and bank settlement stay out of MVP implementation even when a
nearby workflow would make a shortcut tempting. Broader DASH replacement
remains the long-term direction, but pilot evidence controls post-MVP order.

**References:** `docs/PRODUCT.md`, `docs/TODO.md`, `docs/deployment.md`,
`server/app/services/tab_service.py`

## 2026-08-14 — Staff identity and order input become revocable server-owned boundaries

**Context:** The Stage 0 audit found request-selected staff tenancy, weak role
escalation controls, raw reusable invitation secrets, ineffective account
disablement, dead customer/OTP login branches, and public/staff order payloads
that could influence modifier names and price deltas. These were release-level
authority defects rather than missing polish.

**Decision:** Keep guests account-free and allow staff entry only through
business-owner registration or an expiring, hashed, single-use invitation.
Enforce the `owner > manager > staff` hierarchy, tenant derivation, last-owner
and self-removal protections, and a shared password policy. Bind HTTP and
WebSocket credentials to a user `session_version` incremented by security
changes. Resolve every order item, modifier, constraint, price, table, seating,
tab and customer link on the server. Scope idempotency to the tenant and bind it
to a canonical request fingerprint; an exact concurrent retry returns one
order while different reuse conflicts.

**Consequences:** Browser visibility is not authorization, removing a staff
assignment invalidates an already issued credential, and no future client may
add a second order-pricing path. Stage 2 tax snapshots extend the authoritative
line-resolution transaction. Customer accounts and phone OTP remain outside
the MVP unless a later product decision reintroduces them deliberately.

**References:** `server/db/migrations/032_auth_and_invitation_hardening.sql`,
`server/db/migrations/033_order_authority_and_idempotency.sql`,
`server/app/services/auth_service.py`, `server/app/services/order_service.py`,
`server/tests/integration/test_staff_security.py`,
`server/tests/integration/test_order_authority.py`

## 2026-08-14 — Integrity incidents are durable and service time belongs to the venue

**Context:** Concurrent inventory movements could diverge from their ledger,
recipe writes could partly succeed, deduction failures disappeared, public
reservation retries could duplicate work, CRM retention used profile-edit
time, and reminder success was represented by one coarse flag. Staff pages also
rendered operational timestamps in whichever timezone the browser happened to
use.

**Decision:** Lock inventory balances, archive items, reject recipes atomically,
deduplicate threshold alerts, and persist reconciliation/deduction
discrepancies. Serialize CRM identity resolution, preserve conservative consent
and suppression, and derive inactivity from operational records. Give public
reservations a tenant/request fingerprint. Record reservation delivery per
message and channel with retry state, format messages and service-day metrics
in the business timezone, and route retained frontend operational timestamps
through an explicit business-time boundary.

**Consequences:** A fulfillment status can remain non-blocking without hiding
stock corruption; operators can see and reconcile the incident. A successful
channel is not resent merely because another failed. Browser location no longer
changes the displayed day/time of reservations, floor arrivals, inventory
movements, tabs, CRM activity, or insights. Stage 2 replaces the temporary
EUR/`de-DE` boundary and region-neutral phone parsing with stored tenant
configuration.

**References:** `server/db/migrations/034_inventory_integrity.sql`,
`server/db/migrations/035_reservation_and_crm_integrity.sql`,
`server/db/migrations/036_reservation_delivery_attempts.sql`,
`server/app/jobs/inventory_reconciliation.py`,
`server/app/jobs/reservation_reminders.py`, `client/lib/business-time.ts`,
`client/lib/money.ts`

## 2026-08-14 — Region is tenant configuration and tax remains operational

**Context:** The first pilot needs German defaults, but Crowbar's intended bar
and restaurant market is not Germany-only. Hard-coded currency symbols,
browser-local time, a business-wide rate, or code-level food classification
would make expansion unsafe and would falsely imply maintained tax-law
authority. Historical orders also cannot change meaning when a venue edits a
rate later.

**Decision:** Persist ISO country/currency, BCP 47 formatting locale, IANA
timezone, editable tax label, and country-parsed E.164 contact data per tenant.
Country choice offers explicit editable suggestions only; UI translation is
separate. Lock currency after monetary activity. Represent operational tax as
a stable tenant profile with append-only effective-dated versions. Require an
owner/manager to classify newly priced items explicitly; modifiers and happy
hour inherit the item. Calculate each line server-side with decimal half-up
rounding to the currency minor unit and snapshot all currency/profile/rate/
inclusive/net/tax/gross facts on the placed order. Seed Germany's current 19%
standard/beverage and 7% reduced/food examples as editable demo data labelled
non-fiscal, not as runtime law.

**Consequences:** Adding a tenant in another country requires configuration,
not source changes. Existing monetary history cannot be converted by editing a
currency field; a future migration/repricing workflow must preserve old units.
Compound taxes, cash rounding, filings, fiscal invoices/exports, legal preset
maintenance, automatic product classification, and translated UI remain
explicit later programs. The venue's compliant register and adviser remain
authoritative.

**References:** `server/db/migrations/037_regional_tax_configuration.sql`,
`server/app/core/regional.py`, `server/app/services/tax_service.py`,
`server/app/services/order_service.py`,
`client/app/business/settings/region-tax/region-tax-settings-client.tsx`,
`server/tests/integration/test_regional_tax_routes.py`,
`server/tests/integration/test_order_authority.py`,
[German Federal Ministry of Finance: 2026 tax changes](https://www.bundesfinanzministerium.de/Content/DE/Standardartikel/Themen/Steuern/das-aendert-sich-2026.html)

## 2026-08-14 — The MVP hides unsupported states instead of simulating them

**Context:** Retained pages mixed incomplete onboarding and module access with
dead customer/payment/QR paths, browser dialogs, fake contact success,
placeholder reviews, unapproved pricing claims, and unrestricted reservation
embedding. Those surfaces made a supervised demo less trustworthy even where
the underlying operations worked.

**Decision:** Apply shared onboarding and entitlement guards, align ordinary
staff controls with API authority, retain only signed registered-table QR
entry, and replace native alert/confirm with accessible application patterns.
Remove unsupported customer-account, OTP, contact, pricing, review, and payment
package surfaces. Reservation embedding defaults to self and accepts only an
explicit deployment list of exact HTTP(S) origins.

**Consequences:** Hidden features are not represented as shipped, and a future
support, review, pricing, customer-account, or payment workflow must return with
its own authoritative state and abuse/failure handling. Operators must set
`RESERVATION_FRAME_ANCESTORS` before an external site can embed booking.

**References:** `client/components/business-route-guard.tsx`,
`client/next.config.ts`, `client/app/page.tsx`, `docs/deployment.md`

## 2026-08-17 — Imported agent skills were retargeted to Crowbar's real stack

**Context:** Eight skills were installed under `.claude/skills/`. Five of them
had been copied from an unrelated project and described a stack this repository
does not have: database row-level security and service-role keys, a different
package manager and command set, a different UI primitive library and type
system, an LLM retrieval pipeline, and test files that do not exist here. An
agent following them would apply the wrong security model, run commands that
fail, and cite paths that cannot be opened. `docs/SKILLS.md` compounded the
problem by mandating `.agents/skills/` and stating that no workflow module was
installed, and `AGENTS.md` repeated that claim.

**Decision:** Name `.claude/skills/` the accepted location, keeping `.agents/`
documented only as the Codex-compatible mirror. Rewrite `security`, `testing`,
`superpowers`, `frontend-design`, and `full-stack-architect` against verified
source, and replace the foreign examples in `skill-creator` and
`sequential-thinking`. Add four Crowbar-specific skills:
`run-crowbar-service-loop`, `guard-crowbar-tenancy`,
`change-crowbar-money-and-tax`, and `write-crowbar-operational-copy`. Record the
remaining six as planned rather than writing thin versions of them. Require
that every path, command, and filename in a skill be opened before it is cited.

**Consequences:** A skill that describes the wrong stack is worse than no
skill — it is confidently wrong at exactly the moment an agent stops checking.
Imported skills are therefore treated as drafts to be retargeted, never as
installable content. `docs/SKILLS.md` now owns the installed set and the
division of labor between overlapping skills, so a new skill must show it does
not duplicate an existing one. The absence of row-level security is now stated
explicitly in the security and tenancy skills, because the imported text had
taught the opposite.

**References:** `.claude/skills/`, `docs/SKILLS.md`, `AGENTS.md`,
`docs/TODO.md`

## 2026-08-19 — Queue and future waitlist share durable delivery truth

**Context:** A walk-in queue state and a message-delivery result are different
facts. The old lifecycle had no explicit per-service-day capacity policy,
fabricated wait estimates, weak retry protection, and synchronous notification
copy that could claim a guest was reached after a provider failure. Future
waitlist offers had the same delivery problem and an incomplete terminal
lifecycle.

**Decision:** Make queue availability an explicit location/service-day row with
a cover cap, and treat a missing row as closed. Serialize joins on that row,
scope idempotency by tenant/request fingerprint, reject a second active phone,
and derive estimates only from a minimum measured sample. Record queue and
waitlist transitions append-only. Generalize reservation delivery attempts so
queue and waitlist messages commit as pending before provider work, then record
the result separately. Calling remains authoritative even when delivery fails;
only Floor seating occupies registered tables.

**Consequences:** UI copy must distinguish “called” from “message delivered,”
and reconnect must replace projections from authoritative HTTP state. A future
delivery channel can extend the shared target model but cannot infer delivery
from operational status. Queue scheduling automation, richer Floor geometry and
generic offline operation remain separate work.

**References:** `server/db/migrations/038_guest_to_table_lifecycle.sql`,
`server/app/services/queue_service.py`,
`server/app/services/reservation_waitlist_service.py`,
`server/app/services/floor_plan_service.py`

## 2026-08-19 — Fulfillment is line-based; settlement is an external assertion

**Context:** Fixed Kitchen/Bar routing could not represent a tenant's real
stations, order-level fulfillment could not safely reconcile mixed preparation
or exact inventory reversals, and legacy tab closure mixed an operational state
with payment-like language. Corrections and served cancellation also needed a
durable economic audit boundary.

**Decision:** Give each tenant editable preparation stations and route every
catalogue item to one station or the shared queue, snapshotting that route on
placed lines. Make line transitions authoritative and link serve/reversal stock
movements to the exact line. Allow full-cart correction only before preparation
and reasoned whole-order cancellation until settlement. Serialize every
economic tab mutation on the tab row. Represent completion only as an
append-only `settled_externally` event with immutable currency/total snapshot
and optional informational method/reference; reopening appends a manager/owner
reason without changing prior history.

**Consequences:** Placed tax/price snapshots stay immutable, operational
fulfillment may finish after settlement, and no settled tab accepts an economic
mutation until an eligible audited reopen. Informational methods cannot become
partial tenders or amounts by method. The venue's separate compliant register
remains payment and fiscal authority.

**References:** `server/db/migrations/039_ordering_stations_and_corrections.sql`,
`server/db/migrations/040_external_settlement.sql`,
`server/app/services/order_service.py`, `server/app/services/tab_service.py`

## 2026-08-23 — Public capabilities require exchange and table-browser approval

**Context:** Publishing the development repository exposed no committed provider
credential in scanned history, but the application still transported bearer
credentials in URLs, let a photographed table QR order during a seating, shared
staff-oriented response shapes with public routes, and had tenant relationships
that were checked only in selected application paths. The Debian ML runtime also
could not meet the zero-high/critical image gate without suppressing unfixed
findings.

**Decision:** Keep the private canonical repository and generate a separate
portfolio mirror from an explicit tracked-file allowlist. Exchange fragment-only
link credentials for purpose-scoped `__Host-` cookies, hash queue/order bearer
state, authenticate staff WebSockets in a bounded first frame, and make table QR
entry a pending per-browser session requiring current-seating staff approval.
Keep Redis rate limits fail-open with alerts while preserving database locks,
uniqueness, and capacity caps. Add migrations 041–043 for capability state,
Stage 3–4 composite tenant constraints, and the required venue privacy contact.
Use exact public projections and keep external settlement as the only settlement
model. Build the ML runtime from digest-pinned Chainguard build/runtime images,
copying only installed Python packages and LightGBM's OpenMP library into the
non-root final image.

**Consequences:** Legacy credential-bearing URLs and printed QR authority are
intentionally invalid; they require credential rotation and QR reprint during a
separately authorized deployment. Public DTO growth now requires an explicit
allowlist decision and negative contract tests. The public mirror excludes
agent state, plans, history, roadmap, deployment state, local environments, and
undocumented media. Publication remains user-owned and is gated on rotating the
ignored local OpenAI and Resend keys, committing the intended source, exporting
from that commit, and scanning the exact export.

**References:** `server/db/migrations/041_public_capability_hardening.sql`,
`server/db/migrations/042_tenant_constraints.sql`,
`server/app/routers/public_capabilities.py`,
`server/app/services/table_guest_session_service.py`, `client/proxy.ts`,
`scripts/export-portfolio.sh`, `ml/Dockerfile`

## 2026-08-24 — Stage 5 preserves one stock ledger and uses moving average cost

**Context:** Purchasing introduces supplier pack prices while current stock,
recipes, and fulfillment already use canonical quantities and an append-only
movement ledger. A second receipt balance or recomputing historical cost from
the latest supplier price would make COGS non-auditable.

**Decision:** Store stock in `each`, ml, or g only; represent cases, bottles,
kegs, litres, kilograms, and similar receiving choices as tenant-owned pack
conversions. Receipts write ordinary positive stock movements and snapshot the
per-base-unit receipt cost. The maintained item cost is moving weighted average;
outgoing movements snapshot the cost then in force.

**Consequences:** Purchase price changes do not rewrite historical consumption
cost. Supplier payment, accounting exports, and fiscal claims remain excluded.
Transfers and count workflows must use the same movement service rather than
mutating balances directly.

**References:** `server/db/migrations/044_inventory_units_and_cost_basis.sql`,
`server/db/migrations/045_suppliers_purchase_orders_and_receiving.sql`,
`server/app/services/inventory_service.py`,
`server/app/services/purchasing_service.py`

## 2026-08-25 — Interface work is a stage, not a side effect

**Context:** Stages 1–6 build authoritative behavior surface by surface, which
means each screen is designed while the workflow behind it is still moving. The
user wants the interface reworked once functionality is right, and then reused
by a mobile client. Without a named stage, that redesign would either leak into
every feature stage or be skipped entirely before the pilot.

**Decision:** Insert stage 7, an interface redesign pass that runs after
stage 6 and before the local release gate, and append stage 11, a mobile client
that reuses stage 7's design contract. The previous stages 7, 8, and 9 became
8, 9, and 10. Stage 7 is explicitly a presentation stage: it adds no features,
and a surface that needs a missing field or endpoint stays honest and files a
`TODO.md` item instead. `DESIGN.md` is its deliverable — promoted from a
description of what exists into the contract every surface derives from.

**Consequences:** The release gate in stage 8 and the demo journey now validate
the interface the pilot ships, rather than an interface that will be replaced
after it. Mobile stays behind the pilot: building a second client before the
workflows and the design contract are stable duplicates churn across two
codebases. `MVP_ACCEPTANCE.md`'s matrix now covers stages 1–8.

**References:** `docs/TODO.md` (stages 7 and 11), `docs/DESIGN.md`,
`docs/MVP_ACCEPTANCE.md`

## 2026-08-25 — One reading order, one ownership map

**Context:** The 2026-07-29 documentation contract put the ownership map in
`docs/README.md` and `docs/PORTABLE_AGENT_SETUP.md` while `AGENTS.md` and
`docs/RULES.md` each carried their own reading order, and `RULES.md` restated
product invariants that `PRODUCT.md` already owned. Four copies of the same map
plus an always-on rules file that duplicated domain rules made every task load
more governance than the change needed, and pushed agents toward ceremony over
delivery on an MVP.

**Decision:** `AGENTS.md` is the only reading order and ownership map.
`RULES.md` owns process only — it now opens with scope discipline and no longer
restates reading order, product invariants, or one-off warnings about specific
files. Deleted: `docs/README.md`, `docs/PORTABLE_AGENT_SETUP.md`,
`docs/backlog.md`, `docs/plans/`, and root `reminders.txt`, after reconciling
every unresolved entry into `docs/TODO.md`. `portfolio-docs/` collapsed its
three summary files into one `SUMMARY.md`.

**Consequences:** A fact has exactly one home; a rule that contradicts its
owning document is stale by definition and must be fixed rather than obeyed.
The confirmation gate now asks for one better alternative when the choice is
genuinely open, not a survey of modern patterns — the previous wording invited
gold-plating on a single-venue MVP.

**References:** `AGENTS.md`, `docs/RULES.md`, `docs/SKILLS.md`,
`docs/TODO.md` (Documentation Transition)

## 2026-08-25 — Stage 5 cuts location transfers rather than shipping them unreachable

**Context:** `TODO.md` stage 5 asked for location transfers with in-transit and
reconciliation semantics, and migrations 046/047 created the schema. But the
pilot runs one location, no endpoint anywhere creates a `Location`,
`inventory_items.location_id` is nullable and defaults to `None`, and the model
assumes one inventory row per (item, location) while the schema has one row per
item. `dispatch_transfer()` required `item.location_id == transfer.source_location_id`,
so an ordinary item could never be transferred. Three routes existed that
nothing could reach.

**Decision:** Delete the transfer routes and service functions. Keep migrations
046/047 applied and the ORM models mapped, with docstrings marking them dormant
and naming the trigger. Counts, which a single-location bar genuinely runs, were
completed in full instead.

**Consequences:** Reviving transfers starts with location CRUD and per-location
stock identity, not with the deleted routes — a transfer workflow layered on the
current schema would corrupt location ownership. `MVP_ACCEPTANCE.md`'s stage-5
count row was amended to drop its transfer clauses rather than closed as written.
`PRODUCT.md` already defers multi-location management; this keeps the code
honest about that.

**References:** `docs/TODO.md` (Product Architecture, deferred entry),
`docs/MVP_ACCEPTANCE.md`, `server/app/models/inventory_operations.py`,
`server/app/services/inventory_operations_service.py`

## 2026-08-25 — A purchase order that ends incomplete says so

**Context:** The stage-5 transition map allowed nothing out of `ordered`,
`partially_received` or `received`. An ordered order could never be cancelled,
and a partially received one stayed open forever unless every line arrived. The
obvious patch — allow `cancelled` — would claim nothing was received, which is
untrue once stock is on the shelf and in the movement ledger.

**Decision:** Migration 048 widens the status check with `closed_short`, a
distinct terminal state that requires a reason and records who closed it and
when. The map is now explicit in both directions: `ordered` may be cancelled,
`partially_received` may be completed or closed short, and `received`,
`closed_short` and `cancelled` are terminal. Receiving still recomputes
`partially_received` and `received` from line quantities rather than accepting
them as requests.

**Consequences:** Any future status must be added to the map deliberately rather
than inherited. Reporting that groups "open" orders must treat `closed_short` as
closed, and must not fold it into `cancelled` — the received stock is real.

**References:** `server/db/migrations/048_purchasing_cost_clarity_and_terminal_states.sql`,
`server/app/services/purchasing_service.py`

## 2026-08-25 — Per-pack price and per-base-unit cost stop sharing a column name

**Context:** `purchase_order_lines.unit_price` and
`purchase_receipt_lines.unit_price` hold the per-pack price a buyer types, while
`purchase_price_history` stored the derived per-base-unit cost under the same
name and the same `NUMERIC(18,6)` type. For a case of 24 the two differ by 24x.
Nothing read the history table yet, so the error was latent rather than live.

**Decision:** Rename the derived column to `unit_cost_per_base_unit` in
migration 048, comment all three columns in the database, and document the unit
on the ORM models and Pydantic schemas. Per-base-unit costs are deliberately
**not** quantized at the currency minor unit — rounding 0.054286 EUR/ml to cents
understates consumption cost by roughly eight percent — and are quantized to the
column's own six decimal places instead. Only figures a human reads as an amount
of money go through `currency_quantum`.

**Consequences:** Any future reporting that unions order, receipt and history
prices must convert through the pack conversion's `base_quantity` first. A money
total quantized at the minor unit and a unit cost quantized at six places are
different operations and must not be merged into one helper.

**References:** `server/db/migrations/048_purchasing_cost_clarity_and_terminal_states.sql`,
`server/app/services/purchasing_service.py`, `server/app/services/cost_control_service.py`

## 2026-08-25 — Cost figures state what they could not compute

**Context:** The first cost-control slice returned a reorder suggestion labelled
"served recipe consumption baseline" whose number was pure par-minus-on-hand: the
consumption figure was displayed but never used, and received stock was
subtracted twice because it was already in `current_quantity`. Recently restocked
items were silently suppressed. `MVP_ACCEPTANCE.md` requires that a missing cost,
forecast or lead time yields an explicit incomplete estimate and never invented
precision.

**Decision:** "Incoming" now means genuinely outstanding stock — the undelivered
remainder of open purchase orders — and the forecast is real: par plus expected
consumption over the supplier's lead time, less on-hand and on-order. Every term
is returned in the explanation alongside the formula, and `lead_time_known` is
`false` with a `null` lead time when no supplier product supplies one. Valuation,
margins and COGS each carry a `complete` flag plus the specific reason they are
not: named uncosted items, "No recipe", or a count of movements with no cost.

**Consequences:** A UI may not render a cost figure without also rendering its
incompleteness. Adding a new cost figure means adding its own incompleteness
marker; substituting zero for a missing input is a product defect, not a
rounding choice.

**References:** `server/app/services/cost_control_service.py`,
`server/tests/integration/test_cost_control.py`, `docs/MVP_ACCEPTANCE.md`

## 2026-08-25 — Tenant documents are not served from the public uploads mount

**Context:** Purchase-order attachments are the product's first file upload:
before stage 5, `get_storage_service()` and `generate_upload_path()` had no
callers anywhere. `/uploads` is mounted as an unauthenticated `StaticFiles`
directory, so anything written there is readable by anyone holding the URL.
Delivery notes and supplier invoices are tenant data.

**Decision:** Attachments store a storage-relative `object_key`, never a public
`/uploads/...` URL, and are read back through an authenticated, tenant-scoped
route that streams the bytes. `StorageService` gained a `download` method, and
the local implementation refuses to read outside the upload root. Uploads are
limited to PDF, JPEG and PNG under 10 MB.

**Consequences:** Any future upload surface follows the same shape — the public
mount is for genuinely public assets only. Because `S3StorageService` still
raises `NotImplementedError`, attachments are local-disk only and do not survive
a container restart; that limitation is recorded in `TODO.md` with its trigger.

**References:** `server/app/services/storage_service.py`,
`server/app/services/purchasing_service.py`, `server/app/routers/purchasing.py`

## 2026-08-26 — Routes ask what they do, not who is asking

**Context:** Stage 6 required a five-role pilot matrix, but the system was
effectively binary. Fifty-seven routes asked for `("owner", "manager")`, two for
`("owner")`, and roughly a hundred and thirty-seven authenticated routes had no
role guard at all — so an ordinary staff member could edit menu prices, settle a
tab externally, post stock movements, read every guest's PII, and read all
analytics. Adding three roles to `require_roles` would have meant hand-maintaining
a role list at every one of those call sites and re-auditing all of them the next
time a role appeared.

**Decision:** Authorization is expressed as capabilities. `app/core/permissions.py`
maps each of the five roles to a set of capability strings, and routes ask
`require_capability("purchasing.order.approve")`. The map is hard-coded and
resolved at import time — not configuration, not tenant-editable, no admin UI.
`require_roles` was deleted; it had no remaining callers. Two boundaries stay
separate: a capability says what a role may do, while `ROLE_MANAGEMENT_AUTHORITY`
says which roles an actor may hand out, which is what stops a manager promoting
someone to manager.

**Consequences:** Every authenticated route must name exactly one capability or
appear on a short recorded exemption list of self-service routes;
`test_permission_matrix.py` fails otherwise, so a new route cannot default open.
`docs/permission-matrix.md` is generated from the running app and is the review
artifact — regenerate it when a guard changes. The frontend mirror in
`client/lib/permissions.ts` is generated from the same module and parity-tested,
so it cannot drift into showing a control the API will reject. If a future
requirement asks a venue to define its own roles, that is the deferred RBAC
evaluation in `TODO.md`, not an extension of this map.

**References:** `server/app/core/permissions.py`, `server/app/dependencies.py`,
`server/scripts/generate_permission_matrix.py`, `docs/permission-matrix.md`,
`server/tests/integration/test_permission_matrix.py`,
`client/tests/unit/permissions.test.ts`

## 2026-08-26 — The old `staff` role became host/server, and lost access on the way

**Context:** Migration 049 replaces `('owner','manager','staff')` with the five
pilot roles. Existing `staff` rows had to become something. The honest problem is
that `staff` was not a role — it was the absence of one, and it could do a great
deal: edit menu prices and tax assignments, settle tabs externally, post stock
movements, open and reconcile counts, read every guest record.

**Decision:** `staff` backfills to `host_server`, the closest fit to a general
front-of-house employee. This is a deliberate narrowing, not a rename: a
host/server no longer edits prices, posts stock movements, or reads cost figures.
An owner reassigns anyone who needs a different row from the Staff page.

**Consequences:** Anyone relying on the old blanket access loses it at migration
time, which is the point of the stage. A role change bumps `session_version`, so
a demotion takes effect for a session that is already open rather than at the
next login — `test_permission_matrix.py` asserts the old token 401s. The seed
carries one account per role so the matrix is demonstrable by signing in.
`PRODUCT.md`'s rule that ordinary staff may change item details but not tax or
pricing is preserved by splitting `menu.edit` from `menu.pricing`.

**References:** `server/db/migrations/049_role_matrix_and_ml_snapshots.sql`,
`server/app/services/staff_service.py`, `server/db/seeds/001_seed_puzzles.sql`

## 2026-08-26 — Withdrawn consent suppresses marketing, never the guest's own booking

**Context:** `CustomerMarketingConsent` had been captured by the public
reservation flow since stage 2 and read by exactly nothing in any send path. A
guest who withdrew consent kept receiving every email and SMS; the only thing
withdrawal changed was what the guest profile screen displayed. Separately, the
only data-request route was staff-authenticated, so a guest could not raise an
access or withdrawal request themselves.

**Decision:** Every outbound message declares a `message_class`. Marketing is
opt-in and suppressed for a guest who withdrew or never consented; operational
messages — confirmation, reminder, queue-ready, waitlist offer — are never
suppressed, because they fulfil the guest's own request and silencing them would
be worse for the guest, not better. The synchronous `sms_service.send_sms` has no
database session and therefore cannot check consent, so it *refuses* a marketing
send outright; the only path is `send_marketing_sms`, which takes a session and
checks. Guests raise their own requests through the reservation-management
capability they already hold — no second guest-identity mechanism.

**Consequences:** No marketing sender ships in the MVP, and the gate exists so the
first one cannot skip it. Adding an outbound message means classifying it; there
is no default. Withdrawal completes immediately because it is a setting the venue
controls; access and deletion are recorded `pending` for a human, because marking
them complete on receipt would be a false completion. Every failure on the guest
surface returns the same 404 as the capability exchange, so the surface cannot be
probed for whether a reservation exists.

**References:** `server/app/services/marketing_consent_service.py`,
`server/app/routers/public_privacy.py`, `server/app/services/sms_service.py`,
`server/tests/integration/test_guest_privacy.py`

## 2026-08-26 — Reports name three value figures and add none of them together

**Context:** Stage 6 added the first reporting surface over orders and tabs.
`PRODUCT.md` requires ordered value, open-tab value and externally settled value
to stay distinguishable and forbids labelling any of them revenue, accounting or
fiscal output. The tempting shape — one "total" tile — would have been both
easier to build and wrong, because Crowbar is not the payment or fiscal
authority and the three figures answer different questions.

**Decision:** The value report returns the three side by side and never a sum.
Externally settled value reads `tab_settlement_events.total_snapshot`, the
immutable amount captured when the venue's register took payment, and is never
recomputed from orders — a later order correction must not rewrite what was
asserted. A test asserts no response *field* is named revenue, accounting,
fiscal, profit or income, and that the disclosure explicitly says none of them is
revenue.

**Consequences:** A comp applied at the register makes the settled figure differ
from the order sum, and both are reported truthfully rather than reconciled.
Adding a money figure to any report means deciding which of the three it is; if
it is none of them, it probably should not ship. Rates return `null` rather than
zero when there is nothing to divide by, so "no bookings" and "no no-shows" never
render identically — the same honesty rule stage 5 set for cost figures.

**References:** `server/app/services/reporting_service.py`,
`server/app/routers/reports.py`, `server/tests/integration/test_reports.py`

## 2026-08-26 — An absent ML service degrades a dashboard and says so

**Context:** The ML service holds its results in process memory, so an ordinary
restart emptied the Insights page. Every panel returned 503 in that state, which
reads to an operator as a Crowbar fault rather than an optional dependency being
away. `ml_predictions` had also existed since migration 002 with no ORM model, so
`Base.metadata.create_all` never created it and
`analytics_service.get_high_risk_reservations` failed with a missing relation in
any test that reached it.

**Decision:** FastAPI snapshots each successful Insights read into
`ml_result_snapshots`, one row per tenant and resource. An unreachable service is
served the snapshot marked `stale: true` with its `captured_at`, or an honest
empty state when there is nothing remembered. An error *response* from a
reachable service is passed through unchanged, because it is a real answer and
hiding it behind a stale figure would mask a genuine fault. `POST
/api/insights/run` keeps its 503 — there is nothing honest to remember about a
run that never started. `ml_predictions`, `business_daily_metrics` and
`ml_result_snapshots` are now mapped.

**Consequences:** A UI may not render a snapshot without rendering its age; a
stale figure shown as live is the defect this exists to prevent. Minimum-data
floors are module constants a venue cannot lower, and a model below its floor
returns no metric rather than one computed from a handful of rows.
`get_high_risk_reservations` returns an empty list because nothing writes
cancellation-risk rows — that gap is recorded in `TODO.md` rather than papered
over with a number.

**References:** `server/app/routers/insights.py`,
`server/app/services/ml_snapshot_service.py`, `server/app/models/ml.py`,
`ml/CONTEXT.md`, `server/tests/integration/test_insights_resilience.py`

## 2026-08-26 — A reservation may have no guest email, and demo data uses a domain email validators accept

**Context:** Two failures with one root. `example.invalid` is an IANA reserved
special-use TLD; Pydantic's `EmailStr` rejects it outright. The demo seed used
`@example.invalid` for all 56 addresses, so `POST /api/auth/login` answered 422
for every seeded account before authentication ran — no demo identity could sign
in, which blocked any verification needing a real session. Separately,
`accept_waitlist_offer` built a `ReservationCreate` with
`email=customer.email or "guest@example.invalid"`, whose `email` was a required
`EmailStr`; the fallback existed precisely for the null case — a guest
anonymised through the CRM retention or consent-withdrawal path while holding a
live waitlist entry — and constructing it raised `ValidationError`, turning that
case into a 500.

**Decision:** The seed uses `@example.com`, reserved by RFC 2606 for
documentation and owned by nobody, so demo data still cannot reach a real
mailbox but validates cleanly. The waitlist fallback was removed rather than
replaced: `ReservationCreate.email` is now `EmailStr | None` and the waitlist
passes `customer.email` through unchanged. A placeholder was rejected because
`create_reservation` feeds the address into `upsert_customer`, so a fabricated
value would have written a fake email back onto the customer record the
withdrawal path had just cleared, and would then have been handed to the
confirmation-email sender. Optional is also what the rest of the surface already
said: `reservations.email` and `customers.email` are nullable, and
`ReservationUpdate` and `ReservationResponse` already type it `str | None`.
`PublicReservationCreate.email` stays required — a guest booking themselves in
still gives an address.

**Consequences:** Staff-side reservation creation now accepts a guest with no
email, which is correct for walk-ins and anonymised guests; the staff form still
asks for one. `_send_reservation_email` skips when there is no address, matching
the `bool(reservation.email)` guard the reminder job and waitlist offer sender
already used — a null address must never reach the provider. Demo addresses must
not be moved to a reserved special-use TLD (`.invalid`, `.test`, `.example`,
`.localhost`) however non-deliverable it looks;
`server/tests/unit/test_seed_credentials.py` reads the seed file and asserts
every address in it passes `LoginRequest`, so that regression fails the suite.

**References:** `server/db/seeds/001_seed_puzzles.sql`,
`server/app/schemas/reservation.py`,
`server/app/services/reservation_waitlist_service.py`,
`server/app/routers/reservations.py`,
`server/tests/unit/test_seed_credentials.py`, `server/DATABASE.md`

## 2026-08-26 — User-level skills are in scope, and stage 7 reopens the direction

**Context:** A catalogue of user-level design and taste skills was installed
under `~/.claude/skills/`. Nothing technically blocked them, but three
repository documents steered an agent away from them in prose. The
`frontend-design` skill said the aesthetic direction was "already committed. Do
not pick a new one", listed introducing a new palette or "bolder direction" as
an anti-pattern, and routed generic design skills to work *outside* this
repository. `docs/SKILLS.md` described the installed thirteen as a closed world
and warned against installing a catalogue. `AGENTS.md` repeated the closed set.
That guidance also contradicted `docs/DESIGN.md`, which states it only
*describes* what exists, and `docs/TODO.md` stage 7, whose deliverable is
promoting `DESIGN.md` into a contract — a pass that cannot run if the direction
is already closed. Stage 6 closed the same day, so stage 7 is next.

**Decision:** User-level skills are in scope for Crowbar work and compose with
the project set. On design work the division is explicit: user-level design and
taste skills own aesthetic direction and craft — palette and type proposals,
hierarchy, motion, component API shape, accessibility and performance review —
while `frontend-design` owns what must stay true in this codebase: the token
mechanism, mandatory empty and module-disabled states, the canonical
money/time/unit helpers, and the compliance copy. The SRM taproom palette and
the Libre Caslon / Hanken Grotesk / Spline Sans Mono stack are named the stage 7
*baseline*, not a closed decision.

**Consequences:** A direction is adopted by changing token values in
`client/app/globals.css` and `docs/DESIGN.md` together in one pass, never by a
component diverging from the rest — two simultaneous design languages is the
failure stage 7 exists to prevent, and it is now the anti-pattern the skill
names. "Tokens, never hex" survives a change of direction unchanged: a new
palette means new token *values*, and call sites should not have to know. Two
constraints remain outside any skill's reach because `docs/RULES.md` and
`docs/PRODUCT.md` outrank all of them — the settlement and revenue vocabulary,
and honest empty, disabled, and failure states. `docs/SKILLS.md`'s bar for
adding a skill is now scoped to skills *committed to this repository*; it never
governed the user's own environment, and a user-level skill that already covers
the ground is a reason not to write a project one.

**References:** `.claude/skills/frontend-design/SKILL.md`, `docs/SKILLS.md`,
`AGENTS.md`, `docs/RULES.md`, `docs/DESIGN.md`, `docs/TODO.md` (stage 7)

## 2026-08-29 — The design direction closed on rev 3, and severity became a rank

**Context:** Stage 7's stated deliverable was promoting `DESIGN.md` from a
description of what exists into a committed contract. A completed external
design — *Crowbar UI color and severity system*, rev 3, locked after three
review passes — arrived to fill that slot: a token file plus six canvases
(System, Landing, Auth, Dashboard, Tablet, States). The 2026-08-26 entry
"stage 7 reopens the direction" is superseded by this one: the direction is
now closed.

**Decision:** The warm SRM "taproom" palette and its Libre Caslon / Hanken
Grotesk / Spline Sans Mono typography are retired in favour of a bottle-green
identity on a fixed paper/ink ground pair, with Archivo / Instrument Sans /
IBM Plex Mono. Three consequences are load-bearing beyond the repaint:

1. **Severity is a rank with an exhaustive qualification test**, not a palette.
   Critical means a time-critical service failure happening now; attend means
   before the night ends; neutral is the default and covers everything a day
   away — par levels, variance, forecasts, and any number being lower than
   someone hoped. The rank is encoded as a procedure in
   `client/lib/severity.ts` so a tier is a function call against real backend
   state rather than a per-component decision. Severity describes the item,
   never the control that resolves it.
2. **Grounds are fixed by surface, not chosen.** Paper for marketing, auth and
   public guest pages; ink for the staff product. The `.dark` / `.theme-night`
   dual-entry-point dark mode, the `crowbar-staff-theme` preference and its
   header toggle were removed — a user-visible feature removal. The boot-script
   mechanism survived because its original constraint still holds: a nested
   layout renders on the client during soft navigation and React never executes
   script elements it creates in a client render.
3. **Rule zero.** No colour, size, spacing value, radius or duration may enter
   the codebase that is not declared in the `:root` block. A value that is
   needed and missing is a design question to raise, not an implementation
   choice.

One token was added to the locked set: `--field-invalid-ink` `#D98B78`.
`--field-invalid` `#7A2414` measures 9.14:1 on paper but **1.84:1 on ink** and
shipped with no dark-ground pair. Nothing rendered wrong, because it was only
used on the paper auth screens — but the product has forms on dark surfaces
(settings, side panels, dialogs, menu editor, filter bars) where validation
would have been invisible. It is deliberately muted against
`--critical-text-ink` `#F2604F` so a field error never reads as a service alarm
on the same screen.

**Consequences:** `docs/DESIGN.md` is now an authority to obey rather than a
baseline to argue with, and `.claude/skills/frontend-design` was rewritten in
the same change so it cannot contradict it. Aesthetic direction is no longer an
open proposal for design or taste skills; they own craft *within* the system.

Three of the four exhaustive critical cases — ticket past target, guest past
quoted wait, device that cannot send orders — are **not derivable from the
current schema**, so critical legitimately appears on very few surfaces. That
is the honest outcome of the rank, not a gap in the port; `docs/TODO.md` §7a
carries each with a trigger. Do not approximate them into existence: an
approximated red is a lie about the night.

Retired token names (`--brass`, `--lager`, `--dubbel`, `--porter`, `--oxblood`,
`--marzen`, `--amber-pour`, `--chart-1..5`) survive briefly as **aliases onto
new tokens**, not as old values, so the surfaces not yet rebuilt render in the
new palette rather than transparently. They are deleted as each surface is
ported. The severity-shaped ones alias to neutral on purpose: aliasing
`--oxblood` to a red would have injected alarm colour the rank forbids onto
count variance and dietary notes.

**References:** `client/app/globals.css`, `client/lib/severity.ts`,
`client/components/ui/`, `docs/DESIGN.md`,
`.claude/skills/frontend-design/SKILL.md`, `docs/TODO.md` (§7, §7a, §7b)

## Entry Template

```markdown
## YYYY-MM-DD — Short decision title

**Context:** What forced a choice?

**Decision:** What was chosen?

**Consequences:** What must future work preserve or revisit?

**References:** Files, migration, issue, PR, or commit.
```
