---
name: security
description: Defensive security review and secure-by-default implementation for Crowbar. Use when adding or changing auth, public endpoints, guest/QR/WebSocket credentials, rate limits, idempotency, migrations, scheduled jobs, the private ML boundary, or anything touching tenant data, secrets, or money-shaped guest input — and when the user asks for a security review, threat model, or hardening pass.
---

# Security

Crowbar is a multi-tenant operations platform for bars and restaurants. Two
things must never happen: **business A observing or mutating business B's
records**, and **a public guest surface accepting money-shaped input the server
did not derive itself**. Everything below serves those two properties.

There is **no row-level security here.** Tenant isolation is an application
invariant enforced by `server/app/dependencies.py`. That makes every query a
place isolation can be lost, which is why review order matters.

Division of labor: **this skill is the authority on each invariant** — why it
exists, what breaks without it, the threat it answers, and what to prove with a
test — while `guard-crowbar-tenancy` is the per-change checklist you run while
writing a specific router, service, or page, in the order you should check
things. When that checklist states a rule it points back here for the
rationale. `docs/RULES.md` is the always-on convention layer and wins on
conflict. Run both on a public write path.

## When to use this skill

- Adding or changing a **public, unauthenticated endpoint**
- Touching **auth**, sessions, invitations, password reset, or staff removal
- Issuing or verifying a **credential**: table QR, guest manage link, waitlist
  offer, staff WebSocket token
- Changing **rate limits**, **idempotency**, or anything that costs the venue
  money when replayed
- Touching the **private ML boundary** or a scheduled job in `server/app/jobs/`
- Any request for a "security review", "threat model", "audit", or "hardening"

## The threat model, stated plainly

These adversaries are all reachable today:

1. **An unauthenticated guest with a business slug.** Public reservation, queue
   join, menu, and QR ordering are open by design. Anyone who can read a slug
   can reach them. This is the *primary* adversary here — unlike a purely
   authenticated product, "is this endpoint authenticated?" is not the question.
2. **A holder of a printed QR code** — including a photograph of one taken last
   month, or one lifted from a table that has since been cleared.
3. **A legitimate signed-in staff member** probing another business's rows, or
   exceeding their role (`staff` doing what only `owner`/`manager` may).
4. **A removed or disabled staff member** whose browser still holds a JWT and an
   open WebSocket.
5. **An automated replayer**: the same order, reservation, or queue join sent a
   thousand times, or once with a tampered price.

## Non-negotiable invariants

Break any of these and the review fails, regardless of how clean the code reads.

### 1. Tenant scope is derived, never accepted

Every query against tenant-owned data carries a business predicate, and that
business comes from `get_current_business` (staff) or from a server-side slug
resolution / verified credential (public) — **never** from a request body,
query parameter, or path segment the caller chose. A path `business_id` on a
public route names the tenant; it does not authorize anything, and the route
must still check the module and the row's ownership.

A row the caller may not see is a **404, not a 403**. A 403 confirms the row
exists.

### 2. Pricing is server-authoritative

`server/app/services/order_service.py` resolves menu, category, item, modifier
group, and modifier rows from the tenant's own active menu, then computes names,
happy-hour prices, and modifier deltas from that server-owned data. The client
sends *selections*, never amounts. A cart containing a missing, foreign,
inactive, unavailable, unpublished, or mixed-invalid item is rejected
atomically — before an order, event, stock movement, or tab effect exists.

If you ever find code accepting a client-sent price, price delta, discount,
total, or inventory effect, that is the finding. Write it up with the request
that exploits it.

The same rule extends to tax: placement resolves the effective tax-profile
version server-side after happy-hour and modifier pricing
(`server/app/services/tax_service.py`). The client preview is never calculation
authority.

### 3. Credentials are opaque, revisioned, and rotatable

Three signed-credential families exist. All are HMAC-SHA256 over a compact
payload with `settings.secret_key`; none stores a reusable public secret, and
all bind to a **mutable revision** so the issuer can invalidate outstanding
copies:

- `server/app/services/table_qr_service.py` — `issue_table_token` signs
  `v1.{business_id}.{table_id}.{qr_token_revision}`. Verification requires a
  valid signature, the business, an active table, the *current* revision, and
  an **open seating**. Rotating a table's QR increments the revision, which is
  what makes a lost printed code recoverable. Labels never enter the token.
- `server/app/services/reservation_guest_token_service.py` — account-free
  reservation management links, bound to the reservation's revision.
- `server/app/services/reservation_waitlist_token_service.py` — waitlist offer
  tokens, bound to the entry's revision, with a 15-minute offer expiry.

When adding a guest-facing capability, follow this shape. Do not invent a
bearer credential that cannot be revoked, and do not put a label, name, price,
or table number inside a token where an attacker can read or grind it.

### 4. Staff WebSocket credentials are scoped and short-lived

The primary JWT is httpOnly and never reaches browser JavaScript. Sockets use a
separate 120-second, business-bound credential minted through the Next.js
`/api/ws-token` route and verified by
`server/app/services/websocket_auth.py`, which requires `token_use=websocket`,
the exact business, current staff membership, and a relevant enabled module.
That credential is rejected by normal HTTP authentication, and an HTTP token is
rejected by the socket. Keep both directions of that asymmetry.

### 5. Revocation is immediate, by version

Password/security change, staff removal, and account disablement increment the
user's `session_version`; `get_current_user` re-checks it and the active staff
assignment on every request, so existing HTTP and WebSocket credentials stop
working at once (migration `032_auth_and_invitation_hardening.sql`). Invitation
and password-reset secrets are stored as hashes, expire, and are consumed once;
request endpoints return generic responses so they cannot enumerate accounts.

Any new long-lived credential needs an answer to "what revokes this?" before it
ships.

### 6. Replay is a money bug, not a UX bug

Idempotency keys are unique **per business** — `uq_orders_business_idempotency_key`
in `033_order_authority_and_idempotency.sql`. `order_service` stores a canonical
request fingerprint alongside the key: an exact retry returns the existing order
without republishing an event, and the same key with a *different* request is a
conflict, not a silent overwrite. Concurrent public and staff retries converge
on one persisted order.

A new public mutation that can charge, deduct stock, or consume capacity needs
this treatment at the same time as the feature, not later.

### 7. Rate limits are the abuse boundary

`server/app/core/rate_limit.py` runs Redis-backed rolling windows via a Lua
script, keyed on HMACed client IPs, identity values, business IDs, paths, and
opaque session tokens. Policies already exist for login (identity and IP),
registration, invite acceptance, password reset, public identity writes, public
writes, public order placement, and public reads. Production trusts Railway's
`X-Real-IP`; non-production uses the direct peer address.

Two deliberate properties to preserve: a blocked request returns the standard
`RATE_LIMITED` error body with `Retry-After`, and Redis failure **fails open**
with throttled logging (`action=fail_open`) so a protection-layer incident does
not take reservations or ordering offline. That is an availability choice —
know it is there, and do not quietly rely on the limiter as the only control on
a destructive path.

### 8. The ML service stays private

Staff reach insights through FastAPI, which derives the tenant and forwards the
authoritative business ID with a shared service credential. The ML service has
no browser CORS surface and must never be exposed to the public internet. Its
database access is read-only outside its own output tables — a change that
gives ML broader write access is a security change and needs to be argued as
one (`ml/CONTEXT.md`).

### 9. Settlement is an assertion, not a payment path

Crowbar records that a tab was **settled externally** by the venue's separate
compliant register. It does not take payment, operate a fiscal register, or
issue receipts/invoices. Code, schema, or copy that introduces tender, cash,
change, tips, refunds, card data, processor status, or bank settlement into
that path is a **defect** — treat it as one, and say so plainly rather than
implementing it. See `write-crowbar-operational-copy` for the copy half.

### 10. Errors do not narrate internals

Map failures through `server/app/core/errors.py` to intended status codes and
the structured error body. Do not leak SQL text, table names, driver detail, or
another tenant's identifiers to a client. Log the detail server-side; return
something a person on a shift can act on. Never log full JWTs, credential
strings, or guest contact data.

## Reviewing a change

Roughly descending blast radius:

1. **Tenant scope.** For each new query: which predicate scopes it, and where
   did that business ID come from? "The handler filters" is only an answer if
   you can name the dependency that produced the ID.
2. **Entitlement and role.** Is `require_module` (or `require_any_module`)
   applied on the route *and* the staff page? Does `require_roles` refuse a
   `staff` user where only `owner`/`manager` should pass? Server-side, not a
   hidden button.
3. **Public surface.** Does this endpoint need auth, a signed credential, a
   rate limit, an idempotency key, or all four? What does it cost the venue if
   it runs ten thousand times?
4. **Server-derived values.** Price, discount, happy-hour eligibility, tax
   profile, age, status, capacity, inventory effect — all computed server-side.
5. **Credential lifecycle.** Issue, verify, revision-bind, revoke, expire.
6. **Failure modes.** Timeout, Redis down, duplicate delivery, concurrent
   mutation, a seating closed mid-order. Does anything fail *open* that
   shouldn't?
7. **Logging and errors.** Enough to reconstruct an incident; nothing sensitive
   in the record.

## Prove it with a test

An unproven invariant is a comment. Isolation, role, and abuse claims get a
PostgreSQL-backed integration test that exercises a **second business's**
identity against the real route — not a mock:

- `server/tests/integration/test_tenant_isolation.py` — cross-business reads
  and mutations
- `server/tests/integration/test_staff_security.py` — role hierarchy,
  invitation, revocation
- `server/tests/integration/test_order_authority.py` — server-authoritative
  pricing, idempotency, tax snapshots
- `server/tests/integration/test_rate_limit_routes.py` /
  `test_rate_limit_redis.py` — limiter behavior including backend failure
- `server/tests/integration/test_auth_routes.py` — auth surface
- `ml/tests/test_tenant_isolation.py` — the ML tenant boundary

Extend the matching file rather than starting a new one. Note that backend
integration tests build ORM metadata in `crowbar_test` and do **not** run the
migration chain, so a constraint that exists only in SQL needs deliberate
verification (see `scripts/verify-fresh-db.sh`).

## Anti-patterns

- **"The router filters."** There is no database-level backstop here. That
  filter *is* the control, so it needs a test with a second tenant.
- **Trusting a client-supplied `business_id`, price, or status** because the
  user "would have to tamper with the request." Tampering is the attack.
- **403 where 404 belongs**, leaking row existence across tenants.
- **A guest credential with no revision and no rotation path.** The printed code
  outlives the shift.
- **Adding a public mutation without an idempotency key or rate limit** and
  planning to "add it if abuse shows up."
- **Reintroducing payment semantics** into settlement because a field name
  would be convenient.
- **Reporting a vulnerability without a concrete failure path.** State the
  actor, the request, and what they get.

## Verifying

```bash
cd server && venv/bin/python -m pytest
cd client && npm run lint && npm run test:run && npm run build
```

Migration-level constraints need the fresh-database path:

```bash
cd server && venv/bin/python -m db.migrate
```

Never run `python -m db.migrate reset`.

## References

- In-repo: `docs/RULES.md` (Backend Rules, Do Not), `docs/ARCHITECTURE.md`
  (Core Request Flows), `docs/PRODUCT.md` (Security and visibility boundaries),
  `docs/HISTORY.md` (why a carve-out exists before you remove it)
- Sibling skills: `guard-crowbar-tenancy`, `testing`,
  `write-crowbar-operational-copy`
- OWASP Top 10:2025 — <https://owasp.org/Top10/2025/>
