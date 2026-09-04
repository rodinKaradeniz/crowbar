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

The first release target is a supervised pilot at a single-location bar in
Germany. Its confirmed delivery order is: freeze the MVP contract and baseline;
repair correctness and security; add Germany-ready operational configuration;
complete the guest-to-table loop; complete ordering and external settlement;
finish stock, purchasing, and cost control; finish staff/CRM/reporting; pass a
local demo/release gate; deploy to Railway; then run the supervised pilot.
German fiscal POS and payment processing are a separate post-MVP program. See
[TODO.md](TODO.md) for stage boundaries and exit gates.

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
- **Pack conversion:** tenant-owned metadata saying how many canonical base
  units are in a case, bottle, keg or litre. It is a conversion, never a second
  balance, and it is what lets a buyer order in cases and a bartender count in
  bottles while the ledger stays in one unit.
- **Purchase order:** what the venue has asked a supplier for, counted in packs
  and priced per pack. Its terminal states are received, closed short, or
  cancelled. **Closed short** ends an order the supplier will not complete
  without claiming that nothing arrived.
- **Receipt:** a recorded delivery against a purchase order. It writes ordinary
  stock movements and captures delivery and invoice references for
  reconciliation. Crowbar does not pay the invoice.
- **Moving weighted average cost:** the maintained per-base-unit cost of an
  item. Outgoing movements snapshot the cost in force at the time, so a later
  price change never rewrites what past consumption cost.
- **Count session:** a stocktake or cycle count. Counted-versus-book variance is
  posted to the ledger as ordinary movements, and a shortfall needs a reason.
- **External settlement:** a staff assertion that the venue's separate,
  compliant register completed settlement for the tab. It is not a payment,
  tender, receipt, refund, cash, bank, or fiscal transaction in Crowbar.
- **Operational tax profile:** an owner/manager-configured, effective-dated
  menu classification used to snapshot estimated tax and support price/margin
  analysis. It is not a fiscal record or tax filing authority.

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

### Reservation protection

Booking schedules also own a complete reservation-protection policy, with a
business default and optional booking-type replacement. Owners and managers set
the late-change window, arrival grace period, reminder timing, and whether a
guest can explicitly reconfirm. Staff may mark an active booking as a no-show
only after the effective grace period. A no-show is a distinct terminal record
that releases capacity and appears in the guest timeline, without a fee or
automatic risk action.

Guests receive an account-free, signed management link in transactional
reservation messages. Until the reservation starts, it supports cancellation,
reconfirmation, and server-validated rescheduling. Changes inside the late
window release capacity but are recorded as late rather than blocked. Links
are revision-bound and expire when the reservation is cancelled or no-showed.

A future-reservation waitlist is distinct from the current-service queue. A
host makes a single 15-minute offer within the guest's flexible range; accepting
it atomically rechecks availability and creates a normal reservation. Deposits,
holds, fees, blacklists, and automatic punitive actions remain excluded from
the MVP and belong to the later fiscal POS/payment program.

### Guest CRM and privacy

Each business has a separate, phone-keyed guest identity. Reservations and
phone-bearing queue walk-ins attach to that identity; a guest profile projects
its reservation, queue, tab, and order history from the authoritative
operational records rather than maintaining a duplicate history ledger.

Staff may add titled team notes, free-text preferences, optional date of birth,
and reusable VIP/regular/no-show-risk/birthday or custom tags. A reservation
request is visit-specific by default. Dietary or allergy information becomes a
future-visit profile detail only when staff record that the guest asked for it
to be retained; Floor presents it as a passive, prominent service flag rather
than requiring every staff member to complete an acknowledgement step.
Crowbar does not verify identity or age from a declared date of birth.

Public reservation confirmation offers separate, unchecked email and SMS
marketing opt-ins. They are not required for a booking or transactional
reservation messages, and Crowbar records their source, channel, notice
version, and capture time. There is no marketing automation in this stage.

The venue acts as controller for its guest data and Crowbar acts as processor.
Owners and managers can export a portable profile, correct it through the
profile, reconcile duplicates while retaining history, and anonymise a guest
on a deletion request. The default policy anonymises guest contact and CRM
data after 24 months of inactivity while preserving anonymous operational
history; a venue remains responsible for any lawful retention obligation.

Staff accounts have their own erasure, separate from disabling one. Disabling
blocks sign-in and nothing in the product reverses it, but the person's name
and email stay on file. Deletion is a request the account holder raises for
themselves: the account keeps working for 30 days and signing in cancels the
request, after which name, email, phone and picture are removed and the account
can no longer sign in. The row itself is kept and no longer names anyone, so
every operational record the person created still resolves — to a former staff
member rather than to them. Someone who is the only owner of a business cannot
delete their account until ownership has moved. Deleting a person is not
deleting a venue; closing a venue's account is not self-serve.

### Ordering and inventory

Pricing is server-authoritative. The browser cannot determine which menus are
currently served, submitted prices, alcohol rules, or inventory effects. A menu
outside its activation window is absent from the guest response entirely, and
ordering from one is refused at placement.
Entering `served` records the actual sale movements; reversing service uses
those recorded movements, not the current recipe. Auto-disabled menu items
remain disabled after stock recovery until staff re-enable them.

Public dine-in ordering starts when a registered-table QR creates a pending
browser session for the table's current seating. The QR credential is signed,
purpose-bound and tied to the table revision, but cannot place an order by
itself. Staff must approve that browser from Floor; denial, seating closure,
reseating, expiry, or QR rotation revokes its authority. Each seating has at
most one open tab, so approved guest and staff rounds share one total even when
the seating spans a configured table combination. Staff start or open that tab
from the occupied table on Floor, record it as settled externally after the
venue completes payment in its compliant register, then close the seating. A
seating with an open tab cannot be ended. Legacy free-text table labels remain
historical display data only and are never accepted for new public orders.

Staff put those codes on the tables from one printable sheet, which draws a card
per active table grouped by area, each showing the table's label and the QR
revision the card was printed at. The revision is how someone holding two cards
for the same table can tell which one still works: rotating a table's code makes
every card already printed for it dead paper. **The sheet encodes whatever
address the browser printing it is on**, so a sheet printed from a development
machine encodes `localhost` and is unscannable in the venue — print it from the
address the venue actually uses.

Crowbar may record an informational external method, note, register reference,
actor, timestamp, and immutable tab-total snapshot. It does not record partial
tenders, cash received/change, card details, tips, refunds, processor status,
or bank settlement in the MVP. Reports distinguish ordered value, open-tab
value, and externally settled value; none is labelled accounting or bank
revenue without an authoritative fiscal/payment integration.

Each tenant owns an ISO country and currency, BCP 47 formatting locale, IANA
timezone, editable tax label, country-parsed E.164 phone, free-text address,
and legal drinking age. Country selection only offers editable suggestions;
it never silently changes neighboring settings. Locale controls number/date
formatting while MVP interface copy remains English. Currency can change only
before the tenant has priced catalogue, inventory-cost, or order history.

Tax profiles belong to menu items rather than one business-wide percentage
because food, beverages, and other classes can differ. Owners/managers must
explicitly classify newly priced items and may append effective-dated profile
versions with inclusive/exclusive pricing; ordinary staff may change other
item details but not tax assignments or policy. Modifier prices inherit the
parent item's effective profile. Order placement rounds each line
half-up to the configured currency minor unit and snapshots currency,
profile/version, label, rate, inclusion policy, net, tax, and gross amounts so
later configuration cannot rewrite history.

The German demo suggests editable DE/EUR/`de-DE`/`Europe/Berlin` settings and
19% standard/beverage, 7% reduced/food, exempt, and custom profiles. These are
explicit seed examples, not runtime product classification, legal advice, or a
maintained law catalogue. Other countries use the same manual workflow without
a code change. Every calculated amount is labelled operational/non-fiscal.

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
- Crowbar does not provide payment collection, terminal hardware, acquiring,
  a cash register, tips/tenders/refunds, fiscal receipts/invoices, TSE,
  DSFinV-K, bank settlement, payroll, a general ledger, or subscription billing
  in the MVP. The venue's separate compliant register remains authoritative;
  German fiscal POS/payment work is a distinct post-MVP program.
- Purchasing may capture supplier invoice/reference data, but Crowbar does not
  pay supplier invoices in the MVP.
- Multi-location management UI, a full permission/audit system, and generic
  offline mode remain later decisions; location-ready storage is not a promise
  of those product surfaces.
- Do not add a second payment, booking, or inventory engine for a new channel;
  future channels reuse the authoritative domain paths.

## Product design rules

[DESIGN.md](DESIGN.md) owns visual language, interaction patterns, and
accessibility conventions. Product-facing changes must preserve its token,
semantic-control, keyboard, focus, reduced-motion, and responsive contracts.
