---
name: guard-crowbar-tenancy
description: Per-change checklist for Crowbar's tenant boundary — business derivation, module entitlement, role hierarchy, public-endpoint abuse, guest/QR/WebSocket token scopes, idempotency, and rate limits. Use while writing or reviewing any router, service, or staff page that touches business-owned data or exposes a public surface. Run it alongside the broader `security` skill on public write paths.
---

# Guard the Crowbar tenant boundary

Crowbar has **no row-level security**. Every isolation guarantee is application
code in `server/app/dependencies.py` and the services beneath it. A missing
business predicate is a silent cross-tenant leak with nothing underneath to
catch it.

Division of labor: **this is the per-change checklist** — what to check on the
router, service, or page in front of you, in what order, with the question to
ask. The `security` skill is the authority on the invariants themselves: why
each exists, what breaks without it, and how to prove it with a test. Each
section below names the `security` section that owns its rationale. You do not
need to read `security` first for this list to be actionable; on a public write
path, run both.

Work top to bottom. Every item is either satisfied or a finding.

## When to use

- Adding or changing a router, service query, or staff page touching
  business-owned data
- Adding a public (unauthenticated) endpoint
- Changing roles, module gates, guest credentials, idempotency, or rate limits

## When NOT to use

- Pure presentation work with no data access
- Reviewing an already-merged design for threat coverage — that's `security`

## 1. Business derivation

The rule: tenant scope is derived from the authenticated context or a verified
credential, never accepted from the request. Rationale and the 404-vs-403
reasoning live in `security` § *Tenant scope is derived, never accepted*.

Check, in this order:

1. **Where does the business ID come from?** Name the dependency. Authenticated
   routes use `get_current_business` from `app.dependencies`; a `business_id`
   in the path or body may *select* a tenant on a public route but authorizes
   nothing.
2. **Does every query against tenant-owned data carry a business predicate?**
   Including helpers in the service layer — they get called from a route
   eventually, and "the caller checks" is not a control.
3. **Does the service take the tenant ID from the dependency**, not from an
   unchecked request field?
4. **Is a row the caller may not see returned as 404?** Not 403.
5. **Does the route need `get_current_user` semantics?** It re-checks
   `session_version` and the active staff assignment on every request, so
   password change, staff removal, and disablement invalidate live credentials
   immediately.

```python
from app.dependencies import get_current_business, get_current_user, require_module, require_roles
```

## 2. Module entitlement

Subscribable features are `reservations`, `queue`, `ordering`, `inventory`, and
`insights`.

- **Backend route:** `require_module("<name>")`, or `require_any_module(...)`
  for a cross-module surface such as the floor plan. This is the enforcement.
- **Staff page:** renders `client/components/module-disabled.tsx`. This is
  navigation convenience, not enforcement — but a missing page gate is still a
  finding.
- **Public route:** check the module against the resolved business explicitly
  and return **404**, not 403 — see `get_public_menu` in
  `server/app/routers/ordering.py`.
- **Cross-module action:** the surface may open on any one of several modules,
  but the action still enforces its own owning module. A floor-plan API open to
  reservations/queue/ordering does not license a seating action when the owning
  module is off.

## 3. Role hierarchy

`owner > manager > staff`. Enforce with `require_roles("owner", "manager")` on
the route — not by hiding a button.

- **Owner/manager only:** booking policy, areas/tables/combinations,
  service-day cutoff, QR rotation, tax profiles, regional settings, capacity
  overrides (with a recorded reason), invitations, and guest
  merge/export/anonymise.
- **Ordinary staff:** operational actions.
- **Two structural rules the code enforces — do not weaken:** no self-removal,
  and no removal of the last owner.

## 4. Public surface

Public endpoints today: `POST /api/ordering/{business_id}/orders`,
`POST /api/reservations/public` (plus `/public/manage/{guest_token}/*` and
`/waitlist/public`), `POST /api/queue/{business_id}/join` and `/leave`, and the
public menu/availability reads. The threat model behind this list is in
`security` § *The threat model, stated plainly*.

For any new one, answer all four before shipping:

1. **What derives the tenant?** A server-side slug resolution or a verified
   signed credential.
2. **What does it cost if replayed 10,000 times?** If the answer involves
   money, stock, capacity, or an SMS, it needs an idempotency key **and** a
   rate limit (§6, §7).
3. **What is server-derived?** Price, discount, happy-hour eligibility, tax
   profile, age, status, capacity, inventory effect — all of it. The client
   sends selections, never amounts. See `security` § *Pricing is
   server-authoritative*.
4. **What does it leak?** Public responses must not carry staff-only table,
   customer, pricing, or operational data.

## 5. Token scopes

The rule: never widen or cross a credential family. Why each is shaped the way
it is — opacity, revision binding, rotation, and the HTTP/WebSocket asymmetry —
is in `security` § *Credentials are opaque, revisioned, and rotatable* and
§ *Staff WebSocket credentials are scoped and short-lived*.

Identify which credential your change touches, and keep it inside its column:

| Credential | Issued by | Scope | Invalidated by |
| --- | --- | --- | --- |
| Staff JWT | `auth_service`, httpOnly `rk-token` cookie | full staff API | `session_version` bump |
| Table QR | `services/table_qr_service.py` | one table, one revision, requires an **open seating** | QR rotation |
| Guest manage link | `services/reservation_guest_token_service.py` | one reservation, one revision | reservation revision change, cancel/no-show |
| Waitlist offer | `services/reservation_waitlist_token_service.py` | one entry, one revision | 15-minute expiry, revision change |
| Staff WebSocket | `/api/ws-token` → `services/websocket_auth.py` | one business, 120s, `token_use=websocket` | expiry, `session_version` bump |

Checks: a WebSocket credential must stay rejected by HTTP auth and an HTTP
token rejected by the socket; a new guest credential must be opaque,
revision-bound, and rotatable — never a bare row ID; and you must be able to
answer "what revokes this?" before it ships.

## 6. Idempotency

The rule: a public mutation that can charge, deduct stock, or consume capacity
gets an idempotency key at the same time as the feature. `security` § *Replay
is a money bug, not a UX bug* explains what a replay actually costs here.

- Keys are unique **per business** — `uq_orders_business_idempotency_key`,
  migration `033_order_authority_and_idempotency.sql`. Never scope a key
  globally; that leaks one tenant's key space into another's.
- `order_service` stores a canonical request fingerprint next to the key: an
  exact retry returns the existing order without republishing an event, and the
  same key with a different body is a **conflict**, not an overwrite. Match that
  shape.
- Public reservation creation and queue join carry equivalent
  idempotency/session protection — check yours does too.

## 7. Rate limits

The rule: attach a policy to every new public route.
`server/app/core/rate_limit.py` holds them (login by identity and IP,
registration, invite acceptance, password reset, public identity writes, public
writes, public order placement, public reads) over a Redis rolling window; keys
HMAC the IP, identity, business, path, and session token.

- Call `enforce_rate_limits(...)` or `enforce_public_read_limit` on the new
  route, and pick the policy that matches the cost of the operation.
- Know the deliberate behavior: **Redis failure fails open** with throttled
  `action=fail_open` logging. The limiter is therefore not a sufficient control
  on a destructive path by itself — pair it with idempotency or auth. The
  availability reasoning is in `security` § *Rate limits are the abuse
  boundary*.

## Prove it

A tenancy claim without a test is a comment. Extend
`server/tests/integration/test_tenant_isolation.py` (cross-business reads and
mutations), `test_staff_security.py` (roles, invitations, revocation),
`test_order_authority.py` (server-authoritative pricing, idempotency), or
`test_rate_limit_routes.py`. Drive the **real route as a second business** and
assert 404. A mocked session proves nothing about a missing predicate.

```bash
cd server && venv/bin/python -m pytest
```

## Anti-patterns

- Trusting a body/path `business_id` because the dependency "already ran".
- A module gate on the page but not the route (or the reverse).
- 403 where 404 belongs.
- A public mutation with no idempotency key, added "once we see abuse".
- A guest credential with no revision and no rotation path.
- Reusing a WebSocket credential for HTTP, or widening it beyond one business.
- Adding a query in a service helper without a business predicate because "the
  caller checks".

## Reference

`server/app/dependencies.py`, `docs/ARCHITECTURE.md` (Core Request Flows),
`docs/PRODUCT.md` (Security and visibility boundaries), `docs/RULES.md`
(Backend Rules), sibling skills `security` (owns the invariants and their
rationale), `change-crowbar-schema` (the `business_id` column, its foreign key,
and its index on a new tenant-owned table), and `testing`.
