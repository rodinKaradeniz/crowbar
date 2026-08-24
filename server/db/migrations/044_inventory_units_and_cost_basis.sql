-- Stage 5 starts from the existing stock movement ledger. Quantities remain in
-- one canonical base unit per item: each, ml, or g. Packaging is conversion
-- metadata, never a second balance.
ALTER TABLE inventory_items
    ADD COLUMN base_unit VARCHAR(12) NOT NULL DEFAULT 'each',
    ADD COLUMN dimension VARCHAR(12) NOT NULL DEFAULT 'count',
    ADD COLUMN weighted_average_cost NUMERIC(18, 6),
    ADD COLUMN cost_currency_code VARCHAR(3);

UPDATE inventory_items
SET base_unit = CASE WHEN unit_type IN ('bottle', 'keg') THEN 'ml' ELSE 'each' END,
    dimension = CASE WHEN unit_type IN ('bottle', 'keg') THEN 'volume' ELSE 'count' END,
    weighted_average_cost = cost_per_unit,
    cost_currency_code = (SELECT currency_code FROM businesses WHERE businesses.id = inventory_items.business_id);

ALTER TABLE inventory_items
    ADD CONSTRAINT ck_inventory_base_unit_dimension CHECK (
        (dimension = 'count' AND base_unit = 'each') OR
        (dimension = 'volume' AND base_unit = 'ml') OR
        (dimension = 'mass' AND base_unit = 'g')
    ),
    ADD CONSTRAINT ck_inventory_weighted_cost_nonnegative
        CHECK (weighted_average_cost IS NULL OR weighted_average_cost >= 0);

ALTER TABLE stock_movements
    ADD COLUMN unit_cost_snapshot NUMERIC(18, 6),
    ADD COLUMN cost_currency_code VARCHAR(3),
    ADD COLUMN reference_type VARCHAR(32),
    ADD COLUMN reference_id UUID;

UPDATE stock_movements movement
SET unit_cost_snapshot = item.cost_per_unit,
    cost_currency_code = (SELECT currency_code FROM businesses WHERE businesses.id = movement.business_id)
FROM inventory_items item
WHERE item.id = movement.item_id;

CREATE TABLE inventory_pack_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    label VARCHAR(120) NOT NULL,
    pack_unit VARCHAR(16) NOT NULL CHECK (pack_unit IN ('case', 'each', 'bottle', 'keg', 'kilogram', 'litre', 'millilitre')),
    base_quantity NUMERIC(18, 3) NOT NULL CHECK (base_quantity > 0),
    is_default_receiving_unit BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, business_id),
    UNIQUE (inventory_item_id, label)
);
CREATE UNIQUE INDEX uq_inventory_pack_default
    ON inventory_pack_conversions(inventory_item_id) WHERE is_default_receiving_unit;
CREATE INDEX idx_inventory_pack_business_item
    ON inventory_pack_conversions(business_id, inventory_item_id);

ALTER TABLE inventory_items ADD CONSTRAINT uq_inventory_items_id_business UNIQUE (id, business_id);
ALTER TABLE stock_movements ADD CONSTRAINT fk_stock_movement_item_tenant
    FOREIGN KEY (item_id, business_id) REFERENCES inventory_items(id, business_id) ON DELETE RESTRICT;

CREATE INDEX idx_stock_movements_tenant_item_created
    ON stock_movements(business_id, item_id, created_at DESC);
