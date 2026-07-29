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

**References:** `AGENTS.md`, `CLAUDE.md`, `docs/RULES.md`,
`docs/PRODUCT.md`, `docs/README.md`, `docs/SKILLS.md`,
`docs/TODO.md`

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

## Entry Template

```markdown
## YYYY-MM-DD — Short decision title

**Context:** What forced a choice?

**Decision:** What was chosen?

**Consequences:** What must future work preserve or revisit?

**References:** Files, migration, issue, PR, or commit.
```
