-- Stage 5 purchasing carries two per-unit prices with the same column name.
-- `purchase_order_lines.unit_price` and `purchase_receipt_lines.unit_price` are
-- the per-pack price a buyer types; the price history row derives a per-base-unit
-- cost by dividing by the pack conversion. For a 24-bottle case those differ by
-- 24x, so the derived column is renamed before any reporting reads it. It has no
-- readers yet, which is what makes the rename safe now and expensive later.
ALTER TABLE purchase_price_history
    RENAME COLUMN unit_price TO unit_cost_per_base_unit;

COMMENT ON COLUMN purchase_order_lines.unit_price IS
    'Price per pack (pack_conversion_id), in currency_code. Not per base unit.';
COMMENT ON COLUMN purchase_receipt_lines.unit_price IS
    'Price per pack of the ordered line''s pack conversion, in currency_code. Not per base unit.';
COMMENT ON COLUMN purchase_price_history.unit_cost_per_base_unit IS
    'Observed cost per canonical base unit (each/ml/g), derived at receipt as unit_price / pack.base_quantity.';
COMMENT ON COLUMN supplier_products.last_price IS
    'Most recent per-pack price observed for this supplier product, in currency_code. Not per base unit.';

-- A partially received purchase order had no exit: the transition map allowed
-- nothing out of `ordered`, `partially_received` or `received`, so an order the
-- supplier could not complete stayed open forever. `cancelled` would claim
-- nothing was received, which is untrue once stock is on the shelf and in the
-- ledger, so short closure is its own honest terminal state.
ALTER TABLE purchase_orders
    DROP CONSTRAINT purchase_orders_status_check;

ALTER TABLE purchase_orders
    ADD CONSTRAINT purchase_orders_status_check
    CHECK (status IN ('draft', 'approved', 'ordered', 'partially_received', 'received', 'closed_short', 'cancelled'));

ALTER TABLE purchase_orders
    ADD COLUMN closed_at TIMESTAMPTZ,
    ADD COLUMN closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN closure_reason TEXT;

-- `purchase_price_history.receipt_line_id` was written with no foreign key
-- because `purchase_receipt_lines` lacked the composite tenant key every other
-- Stage 5 table carries. Price trend reporting reads these rows, so orphans
-- become wrong numbers rather than missing ones.
ALTER TABLE purchase_receipt_lines
    ADD CONSTRAINT uq_purchase_receipt_lines_id_business UNIQUE (id, business_id);

ALTER TABLE purchase_price_history
    ADD CONSTRAINT fk_price_history_receipt_line_tenant
    FOREIGN KEY (receipt_line_id, business_id)
    REFERENCES purchase_receipt_lines(id, business_id) ON DELETE SET NULL;

-- Count sessions are the reachable half of Stage 5's operations schema. A second
-- open session over the same location has no coherent book snapshot, so the
-- exclusion is enforced in the database rather than only in the service.
-- `location_id` is nullable and a plain unique index treats every NULL as
-- distinct, which would let unlocated sessions -- the common case, since
-- inventory items default to no location -- stack up unchecked.
CREATE UNIQUE INDEX uq_count_session_open_per_location
    ON inventory_count_sessions (business_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE status = 'open';

-- Bar-native count entry records what the counter actually keyed (a pack count
-- or a keg level) alongside the canonical base-unit quantity it converted to,
-- so a stocktake stays auditable rather than only arithmetically correct.
ALTER TABLE inventory_count_lines
    ADD COLUMN entry_mode VARCHAR(16) NOT NULL DEFAULT 'base_unit'
        CHECK (entry_mode IN ('base_unit', 'pack', 'keg_level')),
    ADD COLUMN entry_value NUMERIC(18, 3),
    ADD COLUMN entry_pack_conversion_id UUID;

ALTER TABLE inventory_count_lines
    ADD CONSTRAINT fk_count_line_entry_pack_tenant
    FOREIGN KEY (entry_pack_conversion_id, business_id)
    REFERENCES inventory_pack_conversions(id, business_id) ON DELETE RESTRICT;

-- Receipt idempotency previously compared keys alone, so replaying a key with a
-- different body silently returned the first receipt instead of refusing. Every
-- other idempotent surface in the product stores a request fingerprint next to
-- the key; receiving stock is the one that can least afford not to.
ALTER TABLE purchase_receipts
    ADD COLUMN request_fingerprint VARCHAR(64);
