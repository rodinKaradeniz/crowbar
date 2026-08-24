CREATE TABLE inventory_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    source_location_id UUID NOT NULL, destination_location_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_transit','received','reconciled','cancelled')),
    reference VARCHAR(120), note TEXT, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    dispatched_at TIMESTAMPTZ, received_at TIMESTAMPTZ, received_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, business_id), CHECK (source_location_id <> destination_location_id),
    FOREIGN KEY (source_location_id, business_id) REFERENCES locations(id, business_id) ON DELETE RESTRICT,
    FOREIGN KEY (destination_location_id, business_id) REFERENCES locations(id, business_id) ON DELETE RESTRICT
);
CREATE TABLE inventory_transfer_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    transfer_id UUID NOT NULL, inventory_item_id UUID NOT NULL, quantity NUMERIC(18,3) NOT NULL CHECK (quantity > 0),
    dispatched_movement_id UUID, received_movement_id UUID, received_quantity NUMERIC(18,3), discrepancy_reason TEXT,
    FOREIGN KEY (transfer_id, business_id) REFERENCES inventory_transfers(id, business_id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_item_id, business_id) REFERENCES inventory_items(id, business_id) ON DELETE RESTRICT,
    UNIQUE (transfer_id, inventory_item_id)
);
CREATE TABLE inventory_count_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    location_id UUID REFERENCES locations(id) ON DELETE RESTRICT, kind VARCHAR(16) NOT NULL CHECK (kind IN ('stocktake','cycle_count')),
    status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','reconciled','cancelled')),
    note TEXT, opened_by UUID REFERENCES users(id) ON DELETE SET NULL, reconciled_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reconciled_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (id, business_id),
    FOREIGN KEY (location_id, business_id) REFERENCES locations(id, business_id) ON DELETE RESTRICT
);
CREATE TABLE inventory_count_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    session_id UUID NOT NULL, inventory_item_id UUID NOT NULL, book_quantity NUMERIC(18,3) NOT NULL,
    counted_quantity NUMERIC(18,3) NOT NULL CHECK (counted_quantity >= 0), variance_quantity NUMERIC(18,3) NOT NULL,
    shrinkage_reason VARCHAR(32), note TEXT, movement_id UUID,
    FOREIGN KEY (session_id, business_id) REFERENCES inventory_count_sessions(id, business_id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_item_id, business_id) REFERENCES inventory_items(id, business_id) ON DELETE RESTRICT,
    UNIQUE (session_id, inventory_item_id)
);
CREATE INDEX idx_count_sessions_tenant_status ON inventory_count_sessions(business_id, status, created_at DESC);
