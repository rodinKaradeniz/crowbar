---
name: andrej-karpathy-skills
description: Behavioral guidelines that reduce common LLM coding mistakes. Derived from Andrej Karpathy's observations on how LLM coding agents go wrong. Applies four principles — no silent assumptions, no over-engineering, no scope creep, define success criteria — to bias Claude toward disciplined engineering over confident-but-wrong output.
---

# Andrej Karpathy Skills

Behavioral guardrails for AI coding. Derived from Andrej Karpathy's observations of the failure modes AI agents fall into.

**Scope note:** in this repo, `docs/RULES.md` already encodes several of these
as always-on rules (don't assume, don't reformat unrelated code, don't
overclaim verification) — RULES.md wins on conflict. Division of labor with
the sibling skills: this one is per-edit behavioral guardrails;
`full-stack-architect` is the cross-stack design workflow;
`sequential-thinking` is reasoning structure for hard decisions;
`superpowers` is the TDD/verification execution loop.

## The four principles

### 1. No silent assumptions

Before making any change, verify understanding. If something is ambiguous, ask instead of guessing. If multiple interpretations exist, present them — don't pick silently.

State assumptions explicitly. If uncertain, ask. Push back when warranted. If something is unclear, stop, name what's confusing, ask.

**Failure mode this addresses:** Claude confidently building the wrong thing for 20 minutes because it assumed the wrong interpretation.

### 2. No over-engineering

The simplest solution that works is the correct solution. Minimum code that solves the problem. Nothing speculative. No features beyond what was asked. No abstractions for single-use code. No "flexibility" or "configurability" that wasn't requested.

If you write 200 lines and it could be 50, rewrite it. Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

**Failure mode this addresses:** Claude turning a 50-line solution into a 500-line abstraction framework.

### 3. No unintended modifications

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused. Don't remove pre-existing dead code unless asked.

**The test:** every changed line should trace directly to the user's request.

**Failure mode this addresses:** Claude reformatting unrelated files, refactoring adjacent code, or "cleaning up" things that weren't broken.

### 4. Define success criteria

Before starting, know what "done" looks like. Transform imperative instructions ("build this") into declarative goals with verification loops ("this should return X when given Y — verify").

LLMs are exceptionally good at looping until they meet specific goals. Don't tell them what to do — give them success criteria and let them iterate against those.

**Failure mode this addresses:** Iteration drifting because there's no clear stopping condition.

## Tradeoffs

These guidelines bias toward caution over speed. For trivial tasks, use judgment. For anything non-trivial, the discipline pays for itself.

Source: `github.com/multica-ai/andrej-karpathy-skills` and `github.com/forrestchang/andrej-karpathy-skills`
