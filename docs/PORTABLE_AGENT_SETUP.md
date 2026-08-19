# Crowbar Governance Setup

This document records the repository-specific application of the portable
governance pack adopted on 2026-07-29. It is an implementation note, not a
second set of agent instructions: [`../AGENTS.md`](../AGENTS.md) and
[`RULES.md`](RULES.md) remain authoritative for everyday work.

## Installed map

| Concern | Authoritative document |
| --- | --- |
| Current repository state, commands, layout, and conventions | [`../AGENTS.md`](../AGENTS.md) |
| Editing, safety, communication, and verification process | [`RULES.md`](RULES.md) |
| Product rules, vocabulary, invariants, scope, and exclusions | [`PRODUCT.md`](PRODUCT.md) |
| Present technical system and data/request flows | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions and their rationale | [`HISTORY.md`](HISTORY.md) |
| Deferred work and delivery order | [`TODO.md`](TODO.md) |
| MVP surface inventory, risk assignment, and release evidence | [`MVP_ACCEPTANCE.md`](MVP_ACCEPTANCE.md) |
| Visual-system rules | [`DESIGN.md`](DESIGN.md) |
| On-demand workflow-module strategy | [`SKILLS.md`](SKILLS.md) |

The repository uses `CLAUDE.md` only as a compatibility pointer to `AGENTS.md`.
Local workflow modules are installed under `.claude/skills/`;
[`SKILLS.md`](SKILLS.md) owns the accepted location, the installed set, and the
evidence required before adding another.

## Operating principles

1. Documentation describes the current repository, not an aspirational state.
2. Each topic has one owner; other documents link rather than restate it.
3. Product rules, technical rationale, future work, and everyday process remain
   separate.
4. Feature work updates the document that owns any changed fact, decision,
   product rule, or deliberate deferral.
5. Inspect before changing; an unusual implementation may be intentional.
6. Report exact verification performed and distinguish it from inspection.
7. Keep instructions specific to Crowbar's actual stack and working patterns.
8. Do not run destructive Git/database operations, install dependencies, or
   change deployment configuration without authorization.

The portable source is adapted rather than copied verbatim so it cannot create
a competing generic authority or import another repository's stack, product,
or workflow assumptions.
