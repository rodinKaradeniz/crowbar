-- Stage 4: tenant-owned preparation stations, independent line fulfillment,
-- exact line-ledger effects, and append-only correction/availability audits.

CREATE TABLE preparation_stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    archived_at TIMESTAMPTZ,
    archived_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_preparation_stations_business_name UNIQUE (business_id, name),
    CONSTRAINT ck_preparation_stations_name CHECK (length(trim(name)) BETWEEN 1 AND 120),
    CONSTRAINT ck_preparation_stations_archive CHECK (
        (is_active AND archived_at IS NULL)
        OR (NOT is_active AND archived_at IS NOT NULL)
    )
);
CREATE INDEX idx_preparation_stations_business_active
    ON preparation_stations (business_id, is_active, sort_order, name);
CREATE TRIGGER update_preparation_stations_updated_at
    BEFORE UPDATE ON preparation_stations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO preparation_stations (business_id, name, sort_order)
SELECT id, 'Kitchen', 10 FROM businesses;
INSERT INTO preparation_stations (business_id, name, sort_order)
SELECT id, 'Bar', 20 FROM businesses;

ALTER TABLE menu_items
    ADD COLUMN preparation_station_id UUID REFERENCES preparation_stations(id) ON DELETE RESTRICT,
    ADD COLUMN routes_to_all_stations BOOLEAN;
UPDATE menu_items mi
SET preparation_station_id = ps.id,
    routes_to_all_stations = FALSE
FROM preparation_stations ps
WHERE ps.business_id = mi.business_id
  AND ps.name = CASE mi.routing_tag WHEN 'bar' THEN 'Bar' ELSE 'Kitchen' END
  AND mi.routing_tag <> 'any';
UPDATE menu_items SET routes_to_all_stations = TRUE
WHERE routing_tag = 'any';
ALTER TABLE menu_items
    ALTER COLUMN routes_to_all_stations SET NOT NULL,
    ALTER COLUMN routes_to_all_stations SET DEFAULT TRUE,
    ADD CONSTRAINT ck_menu_item_station_routing CHECK (
        (routes_to_all_stations AND preparation_station_id IS NULL)
        OR (NOT routes_to_all_stations AND preparation_station_id IS NOT NULL)
    );
CREATE INDEX idx_menu_items_station ON menu_items(business_id, preparation_station_id);

ALTER TABLE item_library
    ADD COLUMN preparation_station_id UUID REFERENCES preparation_stations(id) ON DELETE RESTRICT,
    ADD COLUMN routes_to_all_stations BOOLEAN;
UPDATE item_library il
SET preparation_station_id = ps.id,
    routes_to_all_stations = FALSE
FROM preparation_stations ps
WHERE ps.business_id = il.business_id
  AND ps.name = CASE il.routing_tag WHEN 'bar' THEN 'Bar' ELSE 'Kitchen' END
  AND il.routing_tag <> 'any';
UPDATE item_library SET routes_to_all_stations = TRUE
WHERE routing_tag = 'any';
ALTER TABLE item_library
    ALTER COLUMN routes_to_all_stations SET NOT NULL,
    ALTER COLUMN routes_to_all_stations SET DEFAULT TRUE,
    ADD CONSTRAINT ck_library_item_station_routing CHECK (
        (routes_to_all_stations AND preparation_station_id IS NULL)
        OR (NOT routes_to_all_stations AND preparation_station_id IS NOT NULL)
    );
CREATE INDEX idx_item_library_station ON item_library(business_id, preparation_station_id);

ALTER TABLE order_line_items
    ADD COLUMN preparation_station_id UUID REFERENCES preparation_stations(id) ON DELETE SET NULL,
    ADD COLUMN preparation_station_name VARCHAR(120),
    ADD COLUMN routes_to_all_stations BOOLEAN,
    ADD COLUMN line_status VARCHAR(20);
UPDATE order_line_items li
SET preparation_station_id = ps.id,
    preparation_station_name = ps.name,
    routes_to_all_stations = FALSE
FROM orders o, preparation_stations ps
WHERE o.id = li.order_id
  AND ps.business_id = o.business_id
  AND ps.name = CASE li.routing_tag WHEN 'bar' THEN 'Bar' ELSE 'Kitchen' END
  AND li.routing_tag <> 'any';
UPDATE order_line_items
SET routes_to_all_stations = TRUE
WHERE routing_tag = 'any';
UPDATE order_line_items li
SET line_status = o.status
FROM orders o
WHERE o.id = li.order_id;
ALTER TABLE order_line_items
    ALTER COLUMN routes_to_all_stations SET NOT NULL,
    ALTER COLUMN routes_to_all_stations SET DEFAULT TRUE,
    ALTER COLUMN line_status SET NOT NULL,
    ALTER COLUMN line_status SET DEFAULT 'received',
    ADD CONSTRAINT ck_order_line_station_snapshot CHECK (
        (routes_to_all_stations AND preparation_station_id IS NULL)
        OR (NOT routes_to_all_stations AND preparation_station_name IS NOT NULL)
    ),
    ADD CONSTRAINT ck_order_line_status CHECK (
        line_status IN ('received', 'preparing', 'ready', 'served', 'cancelled')
    );
CREATE INDEX idx_order_lines_station_status
    ON order_line_items(preparation_station_id, line_status, created_at);

CREATE TABLE order_line_status_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    order_line_item_id UUID NOT NULL REFERENCES order_line_items(id) ON DELETE RESTRICT,
    from_status VARCHAR(20),
    status VARCHAR(20) NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_order_line_timeline_status CHECK (
        status IN ('received', 'preparing', 'ready', 'served', 'cancelled')
    )
);
CREATE INDEX idx_order_line_timeline_tenant_line_time
    ON order_line_status_timeline(business_id, order_line_item_id, changed_at);

ALTER TABLE stock_movements
    ADD COLUMN order_line_item_id UUID REFERENCES order_line_items(id) ON DELETE SET NULL;
CREATE INDEX idx_stock_movements_order_line
    ON stock_movements(order_line_item_id)
    WHERE order_line_item_id IS NOT NULL;

ALTER TABLE orders
    ADD COLUMN cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN cancelled_at TIMESTAMPTZ,
    ADD COLUMN cancellation_reason TEXT;

CREATE TABLE order_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL,
    command_fingerprint VARCHAR(64) NOT NULL,
    before_snapshot JSONB NOT NULL,
    after_snapshot JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_order_revisions_business_idempotency
        UNIQUE (business_id, idempotency_key),
    CONSTRAINT ck_order_revision_reason CHECK (length(trim(reason)) > 0)
);
CREATE INDEX idx_order_revisions_tenant_order_time
    ON order_revisions(business_id, order_id, occurred_at DESC);

CREATE TABLE menu_item_availability_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    source VARCHAR(32) NOT NULL,
    is_available BOOLEAN NOT NULL,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_menu_availability_source CHECK (
        source IN ('manual', 'inventory_depletion')
    )
);
CREATE INDEX idx_menu_availability_events_tenant_item_time
    ON menu_item_availability_events(business_id, menu_item_id, occurred_at DESC);
