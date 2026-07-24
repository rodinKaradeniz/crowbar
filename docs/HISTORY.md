# Project History and Decisions

This is the durable, agent-neutral decision log. It is not a changelog of every
commit. Add an entry when a decision constrains future implementation, when a
failure teaches a reusable lesson, or when project direction materially
changes.

Detailed pre-2026-07-23 phase notes remain in `CLAUDE.md` during the transition
to this structure.

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
  skills documents. The large `CLAUDE.md` was retained as a legacy phase
  archive rather than discarded.
- **2026-07-24:** A pre-development confirmation gate was added. Agents must
  surface material unknowns and compare credible modern solution shapes before
  implementing an open product, UX, or architecture choice.

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

## Entry Template

```markdown
## YYYY-MM-DD — Short decision title

**Context:** What forced a choice?

**Decision:** What was chosen?

**Consequences:** What must future work preserve or revisit?

**References:** Files, migration, issue, PR, or commit.
```
