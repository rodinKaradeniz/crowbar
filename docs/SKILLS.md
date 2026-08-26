# Agent Skills Strategy

A skill is a folder containing `SKILL.md` and optional scripts or references.
It loads on a matching task, so it is the right home for a repeatable workflow
that should not sit in every context window. Durable repository facts belong in
`AGENTS.md` and the owning `docs/` file; mechanical enforcement belongs in a
script or hook.

## Location

Shared skills live in `.claude/skills/<skill-name>/SKILL.md`, with optional
`scripts/` and `references/` subdirectories. That is the only location this
repository populates, because the committed skills are authored for and loaded
by Claude Code. `.agents/skills` is the Codex-compatible mirror; a skill that must serve
both tools is mirrored deliberately and says so in its body, never maintained
as two divergent copies. Personal cross-project skills belong in a user-level
directory, not in this repository.

User-level skills under `~/.claude/skills/` are **in scope for Crowbar work**.
This document governs what this repository installs; it does not gate what the
user has installed for themselves. A user-level skill and a project skill
compose — the project skill supplies the Crowbar-specific constraint, the
user-level skill supplies generic craft — and neither may weaken
[`RULES.md`](RULES.md) or [`PRODUCT.md`](PRODUCT.md).

## Installed skills

Thirteen are installed **in this repository**. Ten are Crowbar-specific; three
are generic craft skills. User-level skills are additional to this table and
are deliberately not enumerated here — they change without a commit, and a
stale roster is worse than none.

| Skill | Owns | Triggers on |
| --- | --- | --- |
| `run-crowbar-service-loop` | The pilot journey as the definition of "verified", plus what is not yet implemented | Cross-module operational change; demo or smoke-test requests |
| `guard-crowbar-tenancy` | Per-change checklist: business derivation, module gate, roles, public abuse, token scopes, idempotency, rate limits | Writing a router, service query, or staff page |
| `change-crowbar-money-and-tax` | Currency precision, the currency lock, effective-dated tax versions, inclusive/exclusive policy, immutable line snapshots, the `money.ts` boundary | Pricing, order placement, tax profiles, regional settings, monetary columns |
| `change-crowbar-schema` | Append-only numbered migrations under the custom migrator, the ORM/Pydantic/mapper alignment surface, the migration design checklist | Any table, column, constraint, index, or backfill change |
| `write-crowbar-operational-copy` | Compliance guardrail: "settled externally", no payment or fiscal claims, no "revenue" for uncollected totals, honest empty/failure states | Any user-visible string |
| `security` | The invariants themselves: threat model, why each holds, what breaks without it, what to prove with a test | Auth, public endpoints, credentials, jobs, ML boundary, review requests |
| `testing` | Test selection and the real command matrix; named coverage gaps | Adding tests; verifying behavior |
| `superpowers` | TDD/verification execution loop and evidence-backed completion claims | Feature work; circular debugging; before claiming done |
| `frontend-design` | Applying `DESIGN.md` while writing components, the mid-service usage context, and the constraints a chosen direction must satisfy here | Pages, components, dialogs, visual states |
| `full-stack-architect` | Cross-stack design workflow and Crowbar's layering, migration, event, and domain invariants | Work spanning UI, API, and schema together |

Generic: `sequential-thinking` (reasoning structure for hard decisions),
`andrej-karpathy-skills` (per-edit behavioral guardrails), `skill-creator`
(authoring format, pointing at this document as the quality bar).

## Division of labor to preserve

- `security` is the **authority on each shared invariant** — why it exists,
  what breaks without it, and how to prove it with a test.
  `guard-crowbar-tenancy` is the **per-change checklist** — what to check on
  this router, service, or page right now. Where the checklist touches an
  invariant it states the rule and points at the owning `security` section.
  Run both on a public write path.
- `full-stack-architect` designs the change, `superpowers` executes and
  verifies it, `testing` chooses the tests, `run-crowbar-service-loop` proves
  the operational claim.
- `change-crowbar-schema` owns the migration and its alignment chain;
  `change-crowbar-money-and-tax` owns what a monetary column is allowed to
  mean. A money column change runs both.
- `frontend-design` owns how a surface looks and behaves;
  `write-crowbar-operational-copy` owns what its strings may claim.
- User-level design and taste skills own **aesthetic direction and craft** —
  palette and type proposals, hierarchy, motion, component API shape,
  accessibility and performance review. `frontend-design` owns **what must stay
  true in this codebase** — the token mechanism, mandatory empty and
  module-disabled states, the canonical money/time/unit helpers, and the
  compliance copy. Load both on design work; the second constrains how the
  first is expressed, not which direction it picks.
- `docs/RULES.md` wins over every skill on process conflicts;
  `docs/PRODUCT.md` wins on product conflicts.

## Bar for adding one

This bar governs skills **committed to this repository**, where a stale file
misleads every future agent and every contributor. It is not a rule about the
user's own environment.

Do not add a repository skill for generic knowledge the agent already has, and
do not commit a catalogue preemptively — skill metadata costs context,
overlapping triggers make selection unpredictable, and a stale skill is worse
than none. If a user-level skill already covers the ground, that is a reason
not to write a project one.

The trigger for writing a new skill is **repeated real friction in that
workflow**, not the completeness of a list. Before writing one:

- Confirm no installed skill already covers it; check the division of labor
  above.
- Verify every path, command, and filename by opening it. The 2026-08-17
  retargeting lesson stands: *a skill citing a file that does not exist is
  worse than no skill.*
- Give it concrete example prompts, explicit triggers and non-triggers, and a
  narrow enough scope that implicit activation is predictable.
- State the failure and recovery path, not only the success path.
- Link to the canonical document instead of copying architecture or policy.
- Put repeated mechanical checks in a script, not in prose.

Skills guide judgment. Tests, database constraints, CI, and the type system
remain the enforcement mechanisms.

## Candidates, not commitments

These have been named as plausible future skills. None is scheduled; each waits
for repeated friction in its workflow.

`change-crowbar-service-time`, `change-crowbar-inventory-ledger`,
`change-crowbar-realtime`, `verify-crowbar-change`,
`review-crowbar-shift-usability`, `shape-crowbar-product-change`,
`experiment-crowbar-ml`, `release-crowbar` (also waits on the deployment arc),
and `record-crowbar-decision`.

Skills for a conversational channel or a mobile client are deliberately absent:
the underlying product decisions are unresolved and `docs/TODO.md` owns them.
Do not write a skill for a surface that does not exist yet.
