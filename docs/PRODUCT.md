# Crowbar Product Rulebook

This document owns product behavior, vocabulary, invariants, scope, and
deliberate exclusions. It describes current decisions; implementation details
and data flow belong in [ARCHITECTURE.md](ARCHITECTURE.md), rationale in
[HISTORY.md](HISTORY.md), and deferred work in [TODO.md](TODO.md).

## Product position and audience

Crowbar is a modular, multi-tenant operations platform for bars and
restaurants. It serves public guests booking, joining a queue, browsing menus,
and ordering, alongside venue staff managing service. A business is the tenant;
the current product assumes one active business association per staff login.

The confirmed delivery order is the operational loop: authoritative
reservation availability and capacity; floor plan and tables; guest CRM;
no-show protection; purchasing and cost control; then POS and payment
integrations. The first availability stage is complete locally and the
floor-plan/table-management stage is in progress. See [TODO.md](TODO.md) for
the acceptance boundary and later work.

## Canonical domain vocabulary

- **Business:** the tenant, its staff association, module entitlements, and
  business-local configuration. A location belongs to a business.
- **Customer:** a public human identity, business-scoped and phone-keyed. It is
  not an authenticated `user` account.
- **Service type:** a business-defined booking category with party and duration
  limits plus one availability resource policy: legacy compatibility,
  table-backed allocation, or shared cover capacity. An optional concurrent
  booking guard is separate from capacity.
- **Operating hours:** public venue information. They do not determine booking
  availability.
- **Booking schedule:** the authoritative policy for reservable time. One
  business default may have complete service-type overrides; it owns weekly and
  date-specific bookable windows, notice, horizon, interval, and duration.
- **Reservation interval:** the persisted start/end time accepted by the
  availability service. Pending and confirmed intervals consume the selected
  resource through its optional turn buffer.
- **Table assignment:** advance planning for a reservation or queue party; it
  does not make a table occupied.
- **Seating:** actual occupancy. An open seating owns occupied tables; closing
  it completes the visit and returns tables to ready by default. Staff may mark
  a table as needing reset when that is genuinely useful.
- **Service day:** the business-local hospitality shift, resolved with its IANA
  timezone and configurable cutoff rather than a browser calendar day.
- **Inventory movement:** the authoritative ledger record of a stock change.
  `bottle` and `keg` use the same canonical milliliter math; `each` is for
  countable inventory.

## Product surfaces and rules

### Public guests

Guests use slug-based public reservation, queue, menu, and ordering surfaces.
Reservation choices are only server-returned absolute slots displayed in the
venue timezone; a form must not invent local timestamps or infer availability
from operating hours. Public writes use server validation and the relevant
idempotency/session protections where implemented.

### Staff operations

Staff use the authenticated business dashboard. Module visibility is a helpful
navigation affordance, but entitlement enforcement occurs on both staff pages
and backend routes. Owners and managers control business-wide booking policy
and privileged capacity/availability overrides; ordinary staff have the
operational access explicitly granted by each workflow.

Owners/managers may deliberately override normal booking availability only with
a recorded reason. The override never bypasses tenant scope, future-time,
service ownership, interval alignment, or party-size constraints. A normal
later move clears the current override marker.

### Reservations and floor plan

Booking schedules, not operating hours, determine bookable slots. Schedule
overrides are complete configurations: deleting one returns a service type to
the business default rather than partially inheriting it. New businesses start
with a closed booking schedule until windows are configured.

Owners and managers can make public online reservations available or
staff-only for the whole business. Staff booking, rescheduling, table planning,
and seating remain available either way; a staff-only venue shows public guests
a contact-the-venue state and rejects public availability and creation requests
at the server boundary.

Tables are registered physical resources. Multi-table allocations must match an
active configured combination; capacity overrides require an owner/manager and
an audit reason. The host board's HTTP snapshot is authoritative; real-time
messages only invalidate it for refetching.

Each booking type chooses how availability is backed. Table-backed bookings
automatically hold the smallest suitable registered table or configured
combination; guests never choose physical tables. Cover-backed bookings consume
an owner-set pool of simultaneous reservable covers and support table-free
venues. A turn buffer holds the chosen resource after a reservation ends, with
an exact end/start boundary permitted. Existing booking types remain in legacy
count-guard compatibility mode until an owner configures a resource policy.

### Ordering and inventory

Pricing is server-authoritative. The browser cannot determine final
happy-hour eligibility, submitted prices, alcohol rules, or inventory effects.
Entering `served` records the actual sale movements; reversing service uses
those recorded movements, not the current recipe. Auto-disabled menu items
remain disabled after stock recovery until staff re-enable them.

## Security and visibility boundaries

- Protected actions derive the business from authenticated staff context; a
  path or request-body business ID cannot authorize access.
- Customer data is visible only inside its business. Do not turn customer and
  staff identities into a casual shared profile.
- The main JWT stays in an httpOnly cookie. Browser JavaScript never reads it;
  short-lived WebSocket credentials are separately scoped.
- The ML service remains private. Staff access insights through FastAPI, which
  derives tenant scope; public clients never select an ML tenant or call it.
- Public/operator boundaries are deliberate. Do not expose staff-only table,
  customer, pricing, or operational data through a public surface.

## Deliberately excluded concepts

- Booking availability must not be reconstructed from public operating hours.
- A table assignment must not be treated as occupancy.
- Crowbar does not currently provide terminal hardware, acquiring, payroll, a
  general ledger, or subscription billing. POS/payment work begins with
  provider integrations after the preceding operational stages.
- Multi-location management UI, a full permission/audit system, and generic
  offline mode remain later decisions; location-ready storage is not a promise
  of those product surfaces.
- Do not add a second payment, booking, or inventory engine for a new channel;
  future channels reuse the authoritative domain paths.

## Product design rules

[DESIGN.md](DESIGN.md) owns visual language, interaction patterns, and
accessibility conventions. Product-facing changes must preserve its token,
semantic-control, keyboard, focus, reduced-motion, and responsive contracts.
