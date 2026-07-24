# Agent Documentation

This directory separates durable project knowledge by purpose so agents do not
need to load one large, mixed-lifecycle file.

| Document | Purpose | Read cadence |
| --- | --- | --- |
| [`../AGENTS.md`](../AGENTS.md) | Automatic repository entry point and command map | Every task |
| [`RULES.md`](RULES.md) | Development do's, don'ts, and completion criteria | Every task |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Current system and infrastructure map | Code or infrastructure work |
| [`DESIGN.md`](DESIGN.md) | Current visual system and intentional interaction patterns | Product UI work |
| [`HISTORY.md`](HISTORY.md) | Durable decisions and meaningful project events | Before revisiting established behavior |
| [`TODO.md`](TODO.md) | Canonical current plans, gaps, and reminders | Planning and scoping |
| [`SKILLS.md`](SKILLS.md) | Skill strategy and proposed project-local workflows | Agent tooling work |

Specialized references remain close to their owners:

- `server/DATABASE.md`: database operations and migration authoring
- `ml/CONTEXT.md`: ML pipeline and model details
- `docs/deployment.md`: proposed production deployment
- `client/content/docs/`: end-user documentation rendered in the product

## Maintenance Contract

- Keep `AGENTS.md` concise and operational.
- Update `ARCHITECTURE.md` only when the system shape or authoritative workflow
  changes.
- Append decisions to `HISTORY.md`; do not rewrite history to match the present.
- Move future work into `TODO.md`; it is the only canonical roadmap.
- Add a rule only after a real failure mode or repeated source of ambiguity.
- Verify claims against manifests, migrations, tests, and source before
  changing a document.
