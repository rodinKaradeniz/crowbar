-- Migration 021: Structured waste reason on stock movements
--
-- Manual `waste` movements (spillage, over-pour, breakage, spoilage) previously
-- carried only a free-text `notes` string. That can't be aggregated later to
-- answer "how much do we typically waste per bottle" or "what waste should we
-- expect for this drink" (Phase 9 ML V2 territory). Add a structured, low-
-- cardinality `reason` enum so waste is queryable/groupable by cause.
--
-- Modeled exactly like `movement_type`: a VARCHAR column guarded by a CHECK IN
-- (...) list, NOT a lookup table (follows the existing convention — see the
-- movement_type constraint added in 010/019/020). The existing `notes` column
-- is reused for the optional free-text detail (esp. when reason='other'); no
-- separate `note` column is added, since `notes` already exists.
--
-- Nullable: older/existing waste rows predate this and won't have one; and
-- non-waste movements (receive/adjust/sale/sale_reversal) leave it NULL. Reason
-- is scoped to `waste` in the service/API layer (required there); `adjust` is
-- allowed to carry one but doesn't require it. The DB constraint only validates
-- the value domain, not which movement_type may use it.

ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS reason VARCHAR(20) NULL;

ALTER TABLE stock_movements
    DROP CONSTRAINT IF EXISTS stock_movements_reason_check;

ALTER TABLE stock_movements
    ADD CONSTRAINT stock_movements_reason_check
    CHECK (reason IS NULL OR reason IN ('spillage', 'wrong_measure', 'breakage', 'spoilage', 'other'));
