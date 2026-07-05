-- Migration 020: Order status audit log + stock-movement order reference
--
-- Two related additions supporting the ticket-board redesign (backward status
-- transitions + a status audit trail):
--
--   1. order_status_timeline gains `from_status` so each row records the full
--      transition (from → to), not just the destination. This is the audit log
--      for Part 2 of the ticket-board work — we EXTEND the existing timeline
--      rather than add a parallel `order_status_history` table, because the
--      timeline is already appended from the one transition handler
--      (order_service.advance_order_status) and already serialized to customers.
--      The initial 'received' row written at placement is a creation, not a
--      transition, so its from_status stays NULL (as does changed_by). Every
--      real transition (forward or backward) records a non-null from_status.
--
--   2. stock_movements gains a nullable `order_id` FK. Recipe 'sale' deductions
--      previously had NO machine-readable link back to their order (only a
--      free-text note), so "the movements for order X" was not queryable. The
--      backward-out-of-served flow must credit back EXACTLY what a given order
--      actually deducted (never a recompute from the current recipe, which may
--      have changed) — that requires finding those movements by order. The new
--      'sale_reversal' movement_type records the credit-back, also linked to the
--      order, so repeated serve/un-serve cycles net out precisely.

-- ─── order_status_timeline: record the source status of each transition ───────
ALTER TABLE order_status_timeline
    ADD COLUMN IF NOT EXISTS from_status VARCHAR(20) NULL;
    -- NULL on the initial 'received' placement row (a creation, not a transition).

-- ─── stock_movements: link deductions/reversals to their order ────────────────
ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS order_id UUID NULL REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_order
    ON stock_movements(order_id);

-- ─── stock_movements: allow the 'sale_reversal' type (un-serve credit-back) ────
ALTER TABLE stock_movements
    DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE stock_movements
    ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN ('receive', 'adjust', 'waste', 'sale', 'sale_reversal'));
