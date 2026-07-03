-- Migration 019: Pour/Keg Inventory + Recipe Wiring (Tier B "pour/keg" ∪ Phase 8)
--
-- Wires the previously-dead menu_item_ingredients stub into real recipe data,
-- teaches inventory about units of measure so spirit pours (ml) and kegs (ml)
-- can be tracked accurately, and enables auto-deduction on order fulfillment.
--
-- Design decisions (see CLAUDE.md Non-Obvious "unit-type / ml recipes"):
--   * Canonical storage unit for liquids is ml. For unit_type in ('bottle','keg')
--     both current_quantity and par_quantity are ml, NOT container counts. 'bottle'
--     and 'keg' share identical underlying math — the only difference is which
--     container-size presets the UI offers.
--   * unit_type='each' is the existing countable behavior, completely unchanged.
--   * container_volume_ml is the ml capacity of one storage container (one bottle,
--     one keg). Used when receiving stock ("received 2 bottles" = +2*volume). NULL
--     for 'each' items.
--   * Recipe quantity is stored in the LINKED inventory item's native unit (ml for
--     bottle/keg, count for 'each' garnishes). The deduction math is identical
--     regardless of unit, so a single generic `quantity` column is kept and the
--     redundant `unit` column (derivable from the linked item) is dropped.
--   * stock_movements gains a 'sale' type for automatic recipe deductions, kept
--     distinct from manual receive/adjust/waste in the audit trail.

-- ─── inventory_items: unit-of-measure awareness ───────────────────────────────
ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS unit_type VARCHAR(16) NOT NULL DEFAULT 'each';
    -- 'each' | 'bottle' | 'keg'  (bottle/keg = liquid tracked in ml)

ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS container_volume_ml NUMERIC(10, 3) NULL;
    -- ml capacity of one container (bottle/keg); NULL for 'each' items.

-- ─── menu_item_ingredients: make the recipe real ──────────────────────────────
-- The table was a dead FK stub (Non-Obvious #10) — nothing read or wrote it, so
-- there is no data to migrate. Drop the now-redundant `unit` column; `quantity`
-- is reinterpreted as "amount in the linked inventory item's native unit".
ALTER TABLE menu_item_ingredients
    DROP COLUMN IF EXISTS unit;

-- ─── stock_movements: new 'sale' type for automatic deductions ────────────────
ALTER TABLE stock_movements
    DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE stock_movements
    ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN ('receive', 'adjust', 'waste', 'sale'));
