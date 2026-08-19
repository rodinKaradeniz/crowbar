# Agent Documentation

This directory separates durable project knowledge by purpose so agents do not
need to load one large, mixed-lifecycle file.

| Document | Purpose | Read cadence |
| --- | --- | --- |
| [`../AGENTS.md`](../AGENTS.md) | Current-state entry point, command map, and reading order | Every task |
| [`RULES.md`](RULES.md) | Development do's, don'ts, and completion criteria | Every task |
| [`PRODUCT.md`](PRODUCT.md) | Product rulebook, vocabulary, behavior, and scope | Before product, copy, or domain work |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Current system and infrastructure map | Code or infrastructure work |
| [`DESIGN.md`](DESIGN.md) | Current visual system and intentional interaction patterns | Product UI work |
| [`HISTORY.md`](HISTORY.md) | Durable decisions and meaningful project events | Before revisiting established behavior |
| [`TODO.md`](TODO.md) | Canonical stages 0–9 supervised-MVP sequence, gaps, exit gates, and post-MVP work | Planning and scoping |
| [`MVP_ACCEPTANCE.md`](MVP_ACCEPTANCE.md) | Current route disposition, workflow authority trace, risk register, and stage 1–7 evidence contract | MVP implementation and release verification |
| [`SKILLS.md`](SKILLS.md) | Skill strategy, the installed `.claude/skills/` set, and planned project-local workflows | Agent tooling work |
| [`PORTABLE_AGENT_SETUP.md`](PORTABLE_AGENT_SETUP.md) | Adapted governance setup and document ownership map | Governance changes |

Specialized references remain close to their owners:

- `server/DATABASE.md`: database operations and migration authoring
- `ml/CONTEXT.md`: ML pipeline and model details
- `docs/deployment.md`: verified partial Railway rollout and the local-MVP gate
  that must pass before separately authorized deployment resumes
- `client/content/docs/`: end-user documentation rendered in the product

## Maintenance Contract

- Keep `AGENTS.md` concise and operational.
- Keep product rules in `PRODUCT.md`; keep technical current state in
  `ARCHITECTURE.md`.
- Update `ARCHITECTURE.md` only when the system shape or authoritative workflow
  changes.
- Append decisions to `HISTORY.md`; do not rewrite history to match the present.
- Move future work into `TODO.md`; it is the only canonical roadmap.
- Add a rule only after a real failure mode or repeated source of ambiguity.
- Verify claims against manifests, migrations, tests, and source before
  changing a document.
