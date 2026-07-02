-- Migration 018: Age Verification (self-attestation) — Tier B
--
-- A self-attestation speed bump plus a staff-facing visual cue. NOT identity
-- verification: no ID scanning, no third-party service, no stored proof of age.
--
--   * menu_items.is_alcoholic — per-item flag. Drives (a) the checkout
--     attestation gate on customer self-service channels and (b) the alcohol
--     badge staff see on order tickets.
--   * order_line_items.is_alcoholic — snapshot copied from the menu item at
--     placement time (exactly like routing_tag / unit_price), so the staff badge
--     and the "order contains alcohol" derivation survive later menu edits or
--     item deletion (item_id is nullable).
--   * orders.age_confirmed — the attestation recorded on the order itself. The
--     order-level "contains alcohol" fact is NOT stored; it is derived from the
--     line items on demand (same pattern as the happy-hour price check).
--   * businesses.legal_drinking_age — the age asserted at checkout. Configurable
--     because the product is intended for multiple countries (18 across most of
--     the EU / Turkey, 21 in the US). Default 18. Logic and copy always read this
--     column; no age is hardcoded anywhere.

ALTER TABLE menu_items
    ADD COLUMN IF NOT EXISTS is_alcoholic BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE order_line_items
    ADD COLUMN IF NOT EXISTS is_alcoholic BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS age_confirmed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS legal_drinking_age INT NOT NULL DEFAULT 18;
