---
name: write-crowbar-operational-copy
description: Compliance guardrail for every user-visible string in Crowbar — enforces "settled externally", forbids any claim of payment processing or fiscal authority, forbids calling uncollected order totals revenue, and requires honest empty and failure states. Use when writing or reviewing UI labels, buttons, toasts, emails, SMS, error messages, reports, docs, or marketing copy.
---

# Write Crowbar operational copy

This is a **compliance guardrail, not a style guide**. Crowbar's first release
is a supervised pilot at a German bar whose separate, compliant register remains
the payment and fiscal authority. A string that implies Crowbar took money,
issued a receipt, or holds fiscal authority is a product defect with legal
exposure — not a wording preference.

Voice and visual language belong to `docs/DESIGN.md` and the
`frontend-design` skill. This skill governs what a string may **claim**.

## When to use

- Any user-visible string: labels, buttons, toasts, empty states, errors,
  confirmations, tooltips, table headers
- Transactional email and SMS
- Report and export headings, column names, and totals
- End-user docs in `client/content/docs/` and landing/marketing copy
- Reviewing a PR that adds or changes copy

## When NOT to use

- Internal identifiers, log lines, code comments, and variable names (though
  the same reasoning applies to a *column* name that surfaces in an export)

## Rule 1 — settlement is external, always

Crowbar records a staff **assertion** that the venue's own register completed
settlement. It does not take payment, operate a cash register, or issue
receipts or invoices.

| Use | Never use |
| --- | --- |
| Settle externally | Pay · Take payment · Charge |
| Settled externally | Paid · Payment successful · Payment processed |
| Settled at the register | Transaction complete · Checkout |
| External register reference | Receipt number · Invoice number |
| Recorded by (staff, time) | Processed by · Authorized |

Also excluded from the MVP vocabulary entirely: tender, cash received, change,
tips, split payment, partial payment, refund, void, card, terminal, processor,
acquirer, bank settlement, TSE, DSFinV-K, fiscal export, tax return.

Visual cues count as claims: no card-terminal imagery, no receipt iconography,
no green "payment successful" checkmark pattern.

**Known gap, do not treat as approved precedent.** The tabs surface still shows
the legacy simulated shape — `client/app/business/tabs/tabs-client.tsx` renders
"Settle", a settlement-method select, and a `settled by {method}` toast, and
`server/app/services/tab_service.py` records a `settled_method` label. Stage 4
replaces this with the audited external-settlement assertion (`docs/TODO.md`).
Do not copy this wording into new surfaces, and do not extend it.

## Rule 2 — an uncollected total is not revenue

Crowbar knows what was **ordered**. It does not know what was collected. Report
and dashboard copy must distinguish three different things and never merge them
under one label:

- **Ordered value** — what guests ordered.
- **Open tab value** — ordered and not yet settled.
- **Externally settled value** — what staff recorded the register as having
  settled.

Never label any of these "revenue", "sales", "takings", "income", "turnover",
"gross", or "net" without an authoritative payment or fiscal integration —
which does not exist. Prefer the explicit noun: "Ordered today",
"Open tabs", "Settled externally".

## Rule 3 — tax figures are operational estimates

Tax profiles are tenant-configured, effective-dated operational estimates.
Label calculated tax amounts as operational/non-fiscal where a reader could
mistake them for a filing figure. Use the tenant's configured `tax_label` (the
pilot default is "VAT") rather than hard-coding one. Never write "tax return",
"tax report", "fiscal", "for your accountant", or anything implying legal
advice or a maintained law catalogue.

## Rule 4 — empty and failure states tell the truth

- An empty state says what is absent and, if there is one, the action that
  fixes it. It does not invent placeholder data or a fake count.
- A failure says what failed and what the reader can do. "Something went wrong"
  is not a message; neither is a raw error code.
- **Never report success for something that did not happen.** Contact forms,
  placeholder reviews, and unapproved pricing claims were removed in Stage 1
  precisely because they showed false success (`docs/HISTORY.md`, 2026-08-14).
  Reintroducing that pattern is a regression.
- Delivery state is evidence-based. Do not say a guest "was notified" when the
  record shows only an attempt — the reminder path records per-channel
  attempts, failures, and retries, and staff-facing copy should reflect the
  actual state.
- Do not describe an unbuilt capability as present. If the surface is not
  implemented, hide it rather than simulating it.

## Rule 5 — English copy, locale for formatting only

MVP interface copy is **English** for all tenants. The tenant's BCP 47 locale
controls number, currency, date, and time **formatting** only — it is not a
translation switch. Do not add German (or any other) UI strings as a shortcut,
and do not concatenate translated fragments.

Format through the canonical helpers rather than embedding values in a string:
`client/lib/money.ts` for amounts and `client/lib/business-time.ts` with the
**business timezone** for times. A hard-coded `€`, a browser-local time, or a
literal "19% VAT" in a string is a bug.

## Rule 6 — use the product's own vocabulary

`docs/PRODUCT.md` owns these distinctions; copy that blurs them teaches staff
the wrong model:

- **Assignment** is planning. **Seating** is occupancy. A planned table is not
  "occupied".
- **Queue** is the current service. **Waitlist** is future-reservation
  interest. They are different features.
- **Customer** is a public guest identity, business-scoped and phone-keyed —
  not a staff **user** account.
- **Booking schedule** determines availability. **Operating hours** are public
  information and never imply bookable time.
- **No-show** is a terminal record that releases capacity. It carries no fee
  and no automatic punitive action — copy must not imply one.

## Review checklist

Before shipping a string, ask:

1. Does it claim Crowbar moved money, issued a receipt, or holds fiscal
   authority? → rewrite.
2. Does it call an uncollected total revenue or sales? → rewrite.
3. Does it report success for an attempt, or data for an empty set? → rewrite.
4. Does it hard-code a currency symbol, a rate, a timezone, or a language? →
   use the helpers and tenant configuration.
5. Does it use "assignment" and "seating" (and "queue" vs "waitlist") the way
   the product defines them? → align.

## Verifying

Copy changes are frontend changes:

```bash
cd client && npm run lint && npm run test:run && npm run build
```

Read the string in place at a phone width, in both the staff (`.dark`) and
guest (`.theme-night`) themes.

## Reference

`docs/PRODUCT.md` (canonical vocabulary; deliberately excluded concepts),
`AGENTS.md` (the non-fiscal boundary, which RULES.md's Do-not list does not
restate), `docs/DESIGN.md`
(settlement copy and formatting rules), `docs/TODO.md` (stage 4 settlement,
and the unreviewed landing FAQ copy), sibling skills `frontend-design` and
`change-crowbar-money-and-tax`.
