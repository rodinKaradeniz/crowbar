---
name: skill-creator
description: Creates new SKILL.md files following Anthropic's Agent Skills format. Use when the user wants to codify a workflow, convention, or domain expertise as a reusable skill. Produces skills that follow the progressive disclosure architecture — YAML frontmatter for discovery, focused body under 500 lines, optional references and scripts.
---

# Skill Creator

Create skills that follow Anthropic's Agent Skills format. A skill is a folder with a SKILL.md file that Claude loads on demand when the task matches the skill's description.

## Structure

Every skill is a folder:
skill-name/
├── SKILL.md # required: YAML frontmatter + instructions
├── scripts/ # optional: executable helpers Claude can run
├── references/ # optional: docs loaded only when needed
└── assets/ # optional: templates, fonts, examples

## SKILL.md format

```markdown
---
name: skill-name-in-kebab-case
description: One or two sentences describing what the skill does and when to use it. This is the entire discovery signal — write it for another Claude, not a human. Include the trigger conditions explicitly.
---

# Skill Name

[Instructions Claude follows when this skill is active]

## When to use

[Explicit triggers]

## When NOT to use

[Anti-triggers, so the skill doesn't activate on the wrong things]

## Approach

[How to do the task]

## Anti-patterns

[What to avoid]

## Examples

[Concrete examples, not abstract descriptions]
```

## Authoring principles

### Write for another Claude, not for a human

Include the non-obvious. Don't write "make sure the code is good" — write "verify the tenant boundary holds by driving the route as a second business and asserting 404." Specific, actionable, checkable.

### Keep SKILL.md focused

Under 500 lines to minimize context bloat. If the skill needs more content, move it to `references/` and reference explicitly ("For X patterns, see references/x-patterns.md"). Claude loads referenced files only when needed.

### The description is your only discovery signal

Claude searches skills by their YAML descriptions. If your description is vague ("helps with code"), the skill won't activate when it should. Include:

- What the skill does
- When to use it (triggers)
- What kind of output it produces

Bad: "Helps write better code."
Good: "Refactors Python functions with high cyclomatic complexity into smaller, testable units. Use when a function exceeds 40 lines, has more than 3 nested levels, or when the user asks to 'simplify' or 'refactor' Python code."

### Include concrete examples, not abstract instructions

"Follow good naming conventions" is useless. "Prefer `list_active_seatings` over `get_data`" teaches by example.

### Reference external files explicitly

If your skill uses scripts or reference docs, name them in SKILL.md so Claude knows they exist and when to read them. Don't rely on filesystem discovery.

## Anti-patterns

- **Vague descriptions.** If the skill wouldn't activate on the queries you built it for, the description is wrong.
- **Overloaded skills.** One skill = one focused task. A "general-purpose" skill activates for everything and helps with nothing.
- **Copying documentation into SKILL.md.** Reference documentation from `references/`, don't inline it.
- **Instructions written for humans.** "Read the docs first." Claude can't read docs unless you point at them and explain when.
- **Skipping the "when NOT to use" section.** Without this, the skill activates on wrong tasks.

## Testing a skill

After writing, test it:

1. Ask Claude the kind of question the skill should trigger on. Does it activate?
2. Ask an adjacent question that shouldn't trigger the skill. Does it correctly not activate?
3. Review Claude's use of the skill. Is the output what you wanted?

If any of these fail, iterate on the description and body.

## In this repo

Crowbar's skills live in `.claude/skills/<name>/SKILL.md`. Add a new one there,
not in `.agents/skills/` — that path is documented only as a Codex-compatible
mirror and is not currently populated.

`docs/SKILLS.md` is the quality bar and owns skill strategy. Read it before
authoring: it sets the criteria a skill must meet (explicit triggers *and*
non-triggers, stated inputs/confirmation points/stop conditions, links to the
canonical docs instead of copied architecture, failure behavior as well as the
success path, narrow enough that implicit activation is predictable). It also
lists the skills already installed and the ones planned — check there first so
you extend an existing skill instead of adding an overlapping one.

Two Crowbar-specific requirements on top of the generic format:

- **Verify every path, command, and filename by opening it.** A skill that
  cites a file which does not exist is worse than no skill — the first five
  skills here were imported from another project and had to be retargeted for
  exactly this reason (`docs/HISTORY.md`, 2026-08-17).
- **Do not restate architecture.** `AGENTS.md`, `docs/RULES.md`,
  `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, and `docs/DESIGN.md` own their
  facts. Link to them; a copied fact goes stale silently.

`docs/RULES.md` is blunt about the threshold: do not add a skill for generic
knowledge the agent already has. Skills encode repeated, project-specific, or
fragile workflows.

## Format checklist

- [ ] Skill lives in its own folder
- [ ] SKILL.md has YAML frontmatter with `name` (kebab-case) and `description`
- [ ] Description explains what, when, and what output
- [ ] Body is under 500 lines
- [ ] "When to use" and "When NOT to use" both present
- [ ] Concrete examples, not abstract instructions
- [ ] Anti-patterns listed
- [ ] External references named explicitly

For the canonical format spec, see: `github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md`
