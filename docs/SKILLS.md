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
examples. The first five offer the highest project-specific value.

1. **`shape-crowbar-product-change`** — Turn a goal or suggested UI/architecture
   pattern into clarified user needs, constraints, acceptance criteria, and
   two or three credible solution shapes. Recommend one with tradeoffs and stop
   for confirmation before implementation.
2. **`change-crowbar-feature`** — Trace and implement a vertical slice across
   page/component, browser/server API facades, router, schema, service, model,
   migration, events, mocks, and tests. Trigger on a feature that crosses more
   than one runtime layer.
3. **`change-crowbar-schema`** — Design forward SQL migrations, model/schema
   alignment, data backfills, constraints/indexes, migration-chain checks, and
   PostgreSQL integration tests. Trigger on any persistent data-model change.
4. **`change-crowbar-realtime`** — Preserve commit-before-publish ordering,
   Redis event contracts, projection re-querying, WebSocket auth, HTTP/WS
   mapper parity, retry behavior, and multi-process caveats.
5. **`review-crowbar-tenancy`** — Threat-model auth, resource ownership,
   business scoping, module entitlement, IDOR risk, public endpoints, and test
   coverage. Trigger on auth, staff, business, public write, or cross-tenant
   changes.
6. **`test-crowbar-change`** — Select tests from risk rather than file type:
   unit, PostgreSQL integration, contract, browser journey, accessibility,
   visual, failure, concurrency, and migration-chain checks. Produce a
   verification matrix and report gaps explicitly.
7. **`build-crowbar-ui`** — Apply the existing SRM design tokens, staff/guest
   theme boundaries, shared primitives, responsive behavior, accessibility,
   reduced motion, visual-regression checks, and confirmation of interaction
   shape before coding.
8. **`change-crowbar-inventory`** — Guard native-unit semantics, ml conversion,
   recipe relationships, order-linked movement ledgers, best-effort served
   transitions, and manual re-enable policy.
9. **`experiment-crowbar-ml`** — Define baselines, leakage-safe splits,
   minimum-data behavior, reproducibility, metrics, persistence, and graceful
   frontend failure.
10. **`build-crowbar-conversation`** — Design AI-assisted WhatsApp or future
    channel flows around server-authoritative tools, explicit write
    confirmation, webhook idempotency, human handoff, transcript/privacy
    policy, prompt-injection resistance, simulations, and evaluation.
11. **`plan-crowbar-client-app`** — Decide whether a mobile or desktop client
    has enough device-specific value to justify a new platform, then plan
    offline state, sync conflicts, push, hardware access, auth, releases,
    observability, and shared-versus-native UX.
12. **`release-crowbar`** — Run a risk-based release checklist covering builds,
   tests, migrations, scheduled jobs, event delivery, environment variables,
   health checks, rollback, backup, and smoke tests once deployment exists.
13. **`record-crowbar-decision`** — Turn a resolved design choice or incident
   into a concise `HISTORY.md` entry and update rules/TODO only when warranted.

## Skills for a Fully Equipped Developer

Most normal frontend/backend work does not need a skill; the agent already
knows the technologies. Skills are most valuable where the workflow is
specialized, fragile, or organization-specific.

### Product framing and interaction design

- **`frame-product-change`** — Identify the user, job, context, desired
  outcome, constraints, non-goals, and success evidence before choosing a
  solution.
- **`compare-solution-shapes`** — Compare modal, sheet, popover, inline flow,
  navigation, automation, notification, and “do nothing” options against
  frequency, complexity, interruption cost, mobile behavior, and
  accessibility.
- **`map-service-journey`** — Model the whole human journey across customer,
  staff, support, operations, notifications, and recovery—not only the primary
  screen.
- **`design-progressive-disclosure`** — Reveal complexity when needed without
  hiding critical state or turning every feature into permanent navigation.
- **`instrument-product-learning`** — Define events, funnels, qualitative
  feedback, guardrail metrics, and a decision date before shipping an
  experiment.

### Domain and architecture reasoning

- **`model-domain-invariants`** — Write what must always remain true, legal
  state transitions, ownership boundaries, and behavior under duplicate or
  reordered operations before writing handlers.
- **`design-reversible-change`** — Prefer additive schemas, compatibility
  windows, feature flags, staged backfills, kill switches, and rollback paths
  that preserve option value.
- **`review-temporal-correctness`** — Examine timezones, clocks, ordering,
  retries, expiry, scheduling, stale reads, race conditions, and eventual
  consistency as one problem.
- **`evolve-architecture-with-evidence`** — Set extraction or scaling triggers,
  fitness functions, and decision checkpoints instead of adopting distributed
  complexity speculatively.
- **`simplify-or-delete`** — Search for an existing abstraction, removal,
  consolidation, or policy change that solves the problem with less permanent
  system surface.

### Implementation and verification

- **`change-api-contract`** — Evolve API contracts with compatibility,
  consumer mapping, error semantics, versioning, and contract tests.
- **`change-database-safely`** — Plan expand/migrate/contract steps, backfills,
  constraints, indexes, lock duration, recovery, and mixed-version operation.
- **`test-properties-and-models`** — Test invariants and state machines with
  property, model-based, mutation, fuzz, and metamorphic techniques where
  example tests are weak.
- **`debug-from-evidence`** — Separate observations, hypotheses, experiments,
  and conclusions; minimize reproduction cases and stop changing multiple
  variables at once.
- **`review-change-by-risk`** — Scale review depth to blast radius, data
  irreversibility, privilege, novelty, concurrency, and observability rather
  than lines changed.
- **`upgrade-dependencies-safely`** — Review compatibility, transitive risk,
  provenance, licenses, advisories, lockfiles, behavior changes, and rollback.

### Human quality and inclusive design

- **`audit-accessibility`** — Verify semantics, focus, keyboard, screen-reader,
  contrast, motion, zoom, touch targets, errors, and cognitive load with manual
  and automated checks.
- **`review-human-factors`** — Analyze fatigue, time pressure, accidental
  activation, confirmation bias, alert overload, recoverability, and how the
  UI behaves during a real shift rather than a clean demo.
- **`review-international-readiness`** — Cover language expansion, locale,
  Unicode, names, addresses, phone numbers, timezones, currencies, units,
  calendars, and legal differences.
- **`design-graceful-degradation`** — Preserve a useful core experience under
  slow networks, partial data, unavailable optional services, old clients, and
  constrained devices.
- **`write-operational-ux`** — Treat errors, empty states, audit history,
  explanations, support diagnostics, and recovery controls as product
  features.

### Security, privacy, and reliability

- **`threat-model-abuse-cases`** — Model assets, actors, trust boundaries,
  privilege escalation, IDOR, automation abuse, economic attacks, and insider
  misuse before selecting controls.
- **`minimize-data-and-privilege`** — Challenge whether data should be
  collected, how long it lives, who can access it, and whether every service
  needs its current privileges.
- **`design-for-operability`** — Define logs, traces, metrics, SLOs, alerts,
  runbooks, health checks, support tools, and correlation before production.
- **`simulate-failure`** — Exercise retries, duplicates, reordering, partial
  commits, provider outages, queue lag, clock skew, disk pressure, restore,
  regional failure, and operator mistakes.
- **`practice-incident-learning`** — Preserve timelines and evidence, reduce
  impact, identify system contributors without blame, assign durable
  follow-ups, and verify they worked.
- **`test-disaster-recovery`** — Prove backup integrity, restoration time,
  recovery point, credentials, dependency order, and operational ownership.

### Data, ML, and AI systems

- **`define-data-contracts`** — Establish ownership, meaning, quality
  thresholds, lineage, freshness, compatibility, and drift handling for data
  consumed by multiple systems.
- **`evaluate-ml-system`** — Guard against leakage, weak baselines, unstable
  splits, subgroup harm, calibration errors, drift, irreproducibility, and
  offline metrics disconnected from product outcomes.
- **`evaluate-agentic-ai`** — Build task suites, adversarial cases, tool-call
  assertions, hallucination checks, confirmation requirements, human handoff,
  cost/latency budgets, and production feedback loops.
- **`secure-ai-tool-use`** — Treat prompts and retrieved content as untrusted,
  constrain tools by identity and tenant, validate arguments server-side, make
  writes explicit, and audit consequential actions.
- **`govern-data-lifecycle`** — Plan consent, purpose limitation, retention,
  deletion, export, residency, provenance, and model-training boundaries.

### Delivery, economics, and stewardship

- **`design-ci-cd-gates`** — Create fast, diagnostic quality gates and a
  promotion/rollback model without turning CI into a slow, ignored dashboard.
- **`plan-release-and-deprecation`** — Stage rollout, compatibility,
  telemetry, communication, rollback, data migration, and final removal.
- **`model-cost-and-capacity`** — Estimate unit economics, load shape,
  bottlenecks, provider limits, headroom, and the cost of graceful failure
  before scale arrives.
- **`review-build-versus-buy`** — Include integration, lock-in, exit cost,
  compliance, operability, and team attention—not only license price.
- **`preserve-institutional-memory`** — Record why, rejected alternatives,
  validity conditions, incidents, and reversal triggers so future teams do not
  rediscover the same constraints.
- **`assess-socio-technical-impact`** — Ask who operates, supports, moderates,
  is measured by, can be harmed by, or can exploit a system; technical
  correctness alone is not sufficient.

## Questions Exceptional Engineers Keep Asking

These questions are useful ingredients for skills and review checklists:

- What problem are we solving, for whom, and how will we know it improved?
- Is the proposed interface the best interaction shape, or merely the first one
  named?
- What must always be true, including during retries and partial failure?
- What happens when the same command arrives twice, late, or out of order?
- Can this change be rolled back after data has changed?
- What will an operator see at 03:00 when this fails?
- Who pays the complexity cost: customer, staff, support, operations, or the
  next developer?
- Which optional dependency can fail without taking down the core workflow?
- What data are we keeping that we do not need?
- What is the simplest thing we could delete instead of adding?
- Which assumption has the weakest evidence, and what experiment could test it?
- What would make this architectural decision stop being valid?
- How will a future agent discover why this behavior exists?

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
- Protect validation integrity: evaluate with realistic raw artifacts and avoid
  leaking the expected answer into the test.
- Stay narrow enough that implicit activation is predictable.
- Be revised or removed when real usage shows that it is stale, redundant, or
  too broad.

Skills should guide judgment; they should not pretend judgment can replace
evidence. CI, tests, hooks, type systems, database constraints, observability,
and production feedback remain the enforcement and learning mechanisms.

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
