ALTER TABLE inventory_items
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN archived_at TIMESTAMPTZ,
    ADD CONSTRAINT ck_inventory_par_nonnegative
        CHECK (par_quantity IS NULL OR par_quantity >= 0),
    ADD CONSTRAINT ck_inventory_cost_nonnegative
        CHECK (cost_per_unit IS NULL OR cost_per_unit >= 0),
    ADD CONSTRAINT ck_inventory_container_positive
        CHECK (container_volume_ml IS NULL OR container_volume_ml > 0),
    ADD CONSTRAINT ck_inventory_pour_positive
        CHECK (default_pour_ml IS NULL OR default_pour_ml > 0);

ALTER TABLE stock_movements
    DROP CONSTRAINT IF EXISTS stock_movements_item_id_fkey;

ALTER TABLE stock_movements
    ADD CONSTRAINT stock_movements_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT;

CREATE TABLE inventory_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
    kind VARCHAR(40) NOT NULL,
    details TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_inventory_discrepancies_business_status
    ON inventory_discrepancies (business_id, status, created_at DESC);
