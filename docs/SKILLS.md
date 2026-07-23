# Agent Skills Strategy

## What Skills Are For

Codex uses skills. A skill is a folder containing `SKILL.md` and optional
scripts, references, and assets. It can trigger explicitly by name or
implicitly when its description matches a task.

Use `AGENTS.md` for durable repository facts and rules. Use a skill for a
repeatable workflow that should load only for a matching task. Use a script or
hook for mechanical enforcement, and an MCP server or connector for live
external systems.

For this repository, check shared skills into:

```text
.agents/
└── skills/
    └── <skill-name>/
        ├── SKILL.md
        ├── agents/openai.yaml    # optional UI metadata
        ├── scripts/              # optional deterministic helpers
        └── references/           # optional on-demand detail
```

Codex scans `.agents/skills` from the working directory up to the repository
root. Personal cross-project skills belong in `$HOME/.agents/skills`; broadly
distributed skill/tool bundles are better packaged as plugins.

Keep each skill narrow. Its frontmatter description should state both when it
triggers and when it does not. Keep detailed architecture in the canonical
project docs and link to it from the skill rather than duplicating it.

## Recommended Crowbar Skills

Create these only as the workflow becomes frequent enough to validate with real
examples. The first four offer the highest project-specific value.

1. **`change-crowbar-feature`** — Trace and implement a vertical slice across
   page/component, browser/server API facades, router, schema, service, model,
   migration, events, mocks, and tests. Trigger on a feature that crosses more
   than one runtime layer.
2. **`change-crowbar-schema`** — Design forward SQL migrations, model/schema
   alignment, data backfills, constraints/indexes, migration-chain checks, and
   PostgreSQL integration tests. Trigger on any persistent data-model change.
3. **`change-crowbar-realtime`** — Preserve commit-before-publish ordering,
   Redis event contracts, projection re-querying, WebSocket auth, HTTP/WS
   mapper parity, retry behavior, and multi-process caveats.
4. **`review-crowbar-tenancy`** — Threat-model auth, resource ownership,
   business scoping, module entitlement, IDOR risk, public endpoints, and test
   coverage. Trigger on auth, staff, business, public write, or cross-tenant
   changes.
5. **`build-crowbar-ui`** — Apply the existing SRM design tokens, staff/guest
   theme boundaries, shared primitives, responsive behavior, accessibility,
   reduced motion, and visual-regression checklist.
6. **`change-crowbar-inventory`** — Guard native-unit semantics, ml conversion,
   recipe relationships, order-linked movement ledgers, best-effort served
   transitions, and manual re-enable policy.
7. **`experiment-crowbar-ml`** — Define baselines, leakage-safe splits,
   minimum-data behavior, reproducibility, metrics, persistence, and graceful
   frontend failure.
8. **`release-crowbar`** — Run a risk-based release checklist covering builds,
   tests, migrations, worker/beat, event delivery, environment variables,
   health checks, rollback, backup, and smoke tests once deployment exists.
9. **`record-crowbar-decision`** — Turn a resolved design choice or incident
   into a concise `HISTORY.md` entry and update rules/TODO only when warranted.

## Skills for a Fully Equipped Developer

Most normal frontend/backend work does not need a skill; the agent already
knows the technologies. Skills are most valuable where the workflow is
specialized, fragile, or organization-specific.

### Engineering workflows

- Contract-first API changes and compatibility review
- Database migration/backfill safety
- CI failure diagnosis and flaky-test triage
- Dependency upgrades and supply-chain review
- Release readiness, rollback, and incident response
- Code review calibrated by risk

### Quality and user experience

- Accessibility audits and keyboard/screen-reader verification
- Responsive and visual-regression testing
- Performance profiling across Web Vitals, SQL, async Python, and ML
- Internationalization, timezone, currency, and locale review
- End-to-end test design and deterministic fixtures

### Security and operations

- Tenant isolation and IDOR review
- Threat modeling and abuse-case analysis
- Secrets, privacy, retention, and regulatory review
- Observability design: logs, traces, metrics, SLOs, alerts
- Concurrency, idempotency, event replay, and failure-injection testing
- Backup/restore and disaster-recovery exercises

### Product and data sophistication

- Architecture decision records and incident retrospectives
- Experiment design and product analytics instrumentation
- Data quality contracts, lineage, and schema drift
- ML leakage/bias/drift review and reproducible evaluation
- Cost and capacity modeling
- Feature flags, staged rollout, backfill, and safe deprecation

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

