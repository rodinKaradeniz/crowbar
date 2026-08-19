---
name: sequential-thinking
description: Applies structured, multi-step reasoning for complex problems that benefit from explicit thought decomposition. Use when a problem needs careful working-through — architectural decisions with multiple tradeoffs, debugging with several possible causes, planning that spans multiple dependent steps, or any task where jumping to an answer would miss important considerations.
---

# Sequential Thinking

For complex problems, think in explicit numbered steps. Revise when assumptions turn out wrong. Branch when there are alternatives worth exploring. Extend when the problem is deeper than initially estimated.

## When to use

- Architectural decisions with multiple defensible approaches
- Debugging where the failure mode isn't obvious
- Planning multi-step work where later steps depend on earlier choices
- Analyzing tradeoffs across cost, performance, maintainability, security
- Any task where the wrong first move locks in a bad path

## When NOT to use

- Simple factual questions
- Well-defined tasks with obvious execution paths
- Requests where the user wants an answer, not analysis

The goal is better decisions on hard problems, not more elaborate explanations for easy ones.

## Structure

### Estimate depth

Before starting, estimate how many thoughts the problem needs. Three is fine for a small architectural choice. Ten might be right for a debugging session with multiple hypotheses. Adjust as you go — extend when you underestimated, wrap up when you overestimated.

### Number each step

Present thoughts as explicit steps: 1/N, 2/N, etc. This makes revision and branching legible.

### Revise when you're wrong

If step 4 shows step 2's assumption was wrong, mark step 2 as revised with the corrected reasoning. Don't just abandon it silently.

### Branch when there are alternatives

If step 3 could go two ways, explore each. Mark the branch: "Branch A: assume X. Branch B: assume Y." Follow each until one dominates or the choice becomes clear.

### End with a conclusion

The final thought should synthesize: what was decided, why, what remains uncertain, and what to do next.

## Anti-patterns

- **Thinking out loud without structure.** The point is discipline, not verbosity.
- **Refusing to revise.** If step 2 was wrong, say so and correct it.
- **Endless branching.** Explore alternatives when they might dominate; not for the sake of thoroughness.
- **Padding thoughts to hit a target count.** Thinking depth serves the problem, not the format.
- **Applying this to trivial tasks.** "Should I fix this typo?" doesn't need sequential thinking.

## Example

For "two guests hit the last table-backed slot at the same moment — where does
the conflict get resolved?":

```
Thought 1/5: The candidates are optimistic (write, detect the constraint
violation, retry), a database uniqueness constraint on the interval, or
pessimistic row locks taken inside the creation transaction.

Thought 2/5: Check what exists before designing. Reservation creation already
locks the resolved booking-schedule row and, for table-backed types, the
active tables in stable order, then rechecks availability and persists the
server-selected allocation in the same transaction. So the mechanism is
pessimistic locking, and the real question is whether the new path reuses it.

Thought 3/5: Revising thought 1 — "optimistic + retry" is not actually
available. Availability isn't one row; it's an overlap query across pending
and confirmed reservations plus turn buffers. There is no single constraint
that expresses "this table is free," so a violation can't be the detector.

Thought 4/5: That leaves reuse versus a parallel implementation. A parallel
one would have to re-derive stable lock ordering, or two concurrent creations
taking tables in different orders deadlock. Stable ordering is the whole
reason the existing code sorts.

Thought 5/5: Reuse the availability service's creation path. The waitlist
offer acceptance already does this — it calls the authoritative
reservation-creation path rather than writing its own claim. Conclusion: route
the new flow through the same service; the open question left for the user is
what the guest sees on SLOT_UNAVAILABLE, since the server returns up to five
alternatives.
```
