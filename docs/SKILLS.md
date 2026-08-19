# Agent Skills Strategy

## What Skills Are For

A skill is a folder containing `SKILL.md` and optional scripts, references, and
assets. It can trigger explicitly by name or implicitly when its description
matches a task.

Use `AGENTS.md` for durable repository facts and rules. Use a skill for a
repeatable workflow that should load only for a matching task. Use a script or
hook for mechanical enforcement, and an MCP server or connector for live
external systems.

## Accepted Location

Shared skills live in `.claude/skills/`:

```text
.claude/
└── skills/
    └── <skill-name>/
        ├── SKILL.md
        ├── scripts/              # optional deterministic helpers
        └── references/           # optional on-demand detail
```

`.claude/skills/` is the primary and only populated location, because the
skills installed here are authored for and loaded by Claude Code. `.agents/`
remains documented as the Codex-compatible mirror: Codex scans `.agents/skills`
from the working directory up to the repository root, so a skill that must also
serve Codex belongs there as well. Do not maintain two divergent copies of the
same skill — if a skill needs to serve both tools, mirror it deliberately and
say so in the skill body. Personal cross-project skills belong in a user-level
directory, not in this repository; broadly distributed skill/tool bundles are
better packaged as plugins.

Keep each skill narrow. Its frontmatter description should state both when it
triggers and when it does not. Keep detailed architecture in the canonical
project docs and link to it from the skill rather than duplicating it.

## Installed Skills

Thirteen skills are installed under `.claude/skills/`. Ten are
Crowbar-specific; three are generic craft skills. This list and the planned
list below are the single source of truth — a skill name appears in exactly one
of them.

### Crowbar-specific

| Skill | Owns | Triggers on |
| --- | --- | --- |
| `run-crowbar-service-loop` | The pilot journey as the definition of "verified", plus what is not yet implemented | Cross-module operational change; demo or smoke-test requests |
| `guard-crowbar-tenancy` | Per-change checklist: business derivation, module gate, roles, public abuse, token scopes, idempotency, rate limits | Writing a router, service query, or staff page |
| `change-crowbar-money-and-tax` | Currency precision, the currency lock, effective-dated tax versions, inclusive/exclusive policy, immutable line snapshots, the `money.ts` boundary | Pricing, order placement, tax profiles, regional settings, monetary columns |
| `change-crowbar-schema` | Append-only numbered migrations under the custom migrator, the ORM/Pydantic/mapper alignment surface, migration design checklist, the two verification paths | Any table, column, constraint, index, or backfill change |
| `write-crowbar-operational-copy` | Compliance guardrail: "settled externally", no payment or fiscal claims, no "revenue" for uncollected totals, honest empty/failure states | Any user-visible string |
| `security` | The invariants themselves: threat model, why each holds, what breaks without it, what to prove with a test | Auth, public endpoints, credentials, jobs, ML boundary, review requests |
| `testing` | Test selection and the real command matrix; named coverage gaps | Adding tests; verifying behavior |
| `superpowers` | TDD/verification execution loop and evidence-backed completion claims | Feature work; circular debugging; before claiming done |
| `frontend-design` | Applying `DESIGN.md` while writing components, plus the mid-service usage context | Pages, components, dialogs, visual states |
| `full-stack-architect` | Cross-stack design workflow and Crowbar's layering, migration, event, and domain invariants | Work spanning UI, API, and schema together |

### Generic

`sequential-thinking` (reasoning structure for hard decisions),
`andrej-karpathy-skills` (per-edit behavioral guardrails), `skill-creator`
(authoring format, now pointing at this document as the quality bar).

### Division of labor to preserve

- `security` is the **authority on each shared invariant** — why it exists,
  what breaks without it, the threat it answers, and how to prove it with a
  test. `guard-crowbar-tenancy` is the **per-change checklist** — what to check
  on this router, service, or page right now, in what order, with the concrete
  question to ask. Where the checklist touches an invariant it states the rule
  and points at the owning `security` section instead of restating the
  rationale. Both stand alone for their own trigger; run both on a public write
  path.
- `full-stack-architect` designs the change, `superpowers` executes and
  verifies it, `testing` chooses the tests, `run-crowbar-service-loop` proves
  the operational claim.
- `change-crowbar-schema` owns the migration and its alignment chain;
  `change-crowbar-money-and-tax` owns what a monetary column is allowed to mean.
  A money column change runs both.
- `frontend-design` owns how a surface looks and behaves;
  `write-crowbar-operational-copy` owns what its strings may claim.
- `docs/RULES.md` wins over every skill on process conflicts;
  `docs/PRODUCT.md` wins on product conflicts.

### Retargeting record

The initial set was imported from another project and described a stack Crowbar
does not have. On 2026-08-17, `security`, `testing`, `superpowers`,
`frontend-design`, and `full-stack-architect` were rewritten against verified
Crowbar source; `skill-creator` and `sequential-thinking` had their foreign
examples replaced. See `docs/HISTORY.md` (2026-08-17). The rule that came out
of it: **a skill citing a file that does not exist is worse than no skill.**
Verify every path, command, and filename by opening it before you cite it.

## Planned, not yet written

Listed so the next agent extends the set deliberately rather than inventing an
overlapping skill. Tracked in `docs/TODO.md`. The trigger for writing one is
repeated real friction in that workflow, not completeness of this list.

- **`change-crowbar-service-time`** — Service-day cutoff, business timezone vs
  UTC, DST, "today" metrics, grace and reminder windows.
- **`change-crowbar-inventory-ledger`** — Milliliter units, ledger authority,
  atomic balance updates, reversal, discrepancies, archive-not-delete, the
  reconciliation job.
- **`change-crowbar-realtime`** — Commit-before-publish ordering, Redis Stream
  contracts, WebSocket auth, HTTP-as-authoritative-fallback parity, mapper
  parity, single-process fan-out caveats.
- **`verify-crowbar-change`** — Risk-based test selection across the real
  command matrix, producing a verification matrix and explicit gaps.
- **`review-crowbar-shift-usability`** — Taps, latency, one-handed use,
  interruption recovery, and accessibility during live service.
- **`shape-crowbar-product-change`** — Turn a goal or a suggested UI pattern
  into clarified needs, constraints, acceptance criteria, and two or three
  credible solution shapes; recommend one and stop for confirmation.
- **`experiment-crowbar-ml`** — Baselines, leakage-safe splits, minimum-data
  behavior, reproducibility, metrics, persistence, graceful frontend failure.
- **`release-crowbar`** — Risk-based release checklist over builds, tests,
  migrations, jobs, environment variables, health checks, rollback, and smoke
  tests. Blocked until the deployment arc resumes.
- **`record-crowbar-decision`** — Turn a resolved design choice or incident
  into a concise `HISTORY.md` entry, updating rules or TODO only when
  warranted.

Skills for a conversational channel or a separate mobile/desktop client are
deliberately absent: the underlying product decisions are unresolved and
`docs/TODO.md` owns them. Do not write a skill for a surface that does not
exist yet.

## Skill Quality Bar

Every authored skill should:

- Have concrete example prompts, explicit triggers, and useful non-triggers.
- State required inputs, user confirmation points, outputs, stop conditions,
  and proportional verification.
- Distinguish facts, inferences, assumptions, and unresolved decisions.
- Link to canonical references instead of copying architecture or policy.
- Use deterministic scripts for repeated mechanical checks and test those
  scripts.
- Include failure and recovery behavior, not only the success path.
- Say what must always be true, including under retries and partial failure,
  and what happens when the same command arrives twice, late, or out of order.
- Say whether the change can be rolled back after data has changed, and what an
  operator sees when it fails mid-shift.
- Protect validation integrity: evaluate with realistic raw artifacts and avoid
  leaking the expected answer into the test.
- Stay narrow enough that implicit activation is predictable.
- Be revised or removed when real usage shows that it is stale, redundant, or
  too broad.

Skills should guide judgment; they should not pretend judgment can replace
evidence. CI, tests, hooks, type systems, database constraints, observability,
and production feedback remain the enforcement and learning mechanisms.

Do not add a skill for generic knowledge the agent already has. Most normal
frontend and backend work needs no skill; skills earn their context cost where
the workflow is specialized, fragile, or specific to this project.

## Adoption Order

1. Use the root documentation for several real tasks.
2. Note repeated instructions, mistakes, or command sequences.
3. Create one project skill around the highest-friction workflow with concrete
   example prompts.
4. Put deterministic repeated checks in scripts, not prose.
5. Validate the skill on a real task, refine it, and add the next skill only
   when its scope is distinct.

Avoid installing a large catalog preemptively. Skill metadata consumes context,
overlapping trigger descriptions cause unpredictable selection, and stale
skills are worse than no skill.
