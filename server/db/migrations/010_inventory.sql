-- Migration 010: Inventory module — stock items, movements, recipe stub

-- ─── Inventory Items ──────────────────────────────────────────────────────────
-- Denormalized stock catalog per business. current_quantity is updated on every
-- stock movement; par_quantity is the low-stock threshold (nullable).

CREATE TABLE IF NOT EXISTS inventory_items (
    id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id      UUID           NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    location_id      UUID           REFERENCES locations(id) ON DELETE SET NULL,
    name             VARCHAR(255)   NOT NULL,
    unit             VARCHAR(50)    NOT NULL DEFAULT 'each',
    current_quantity NUMERIC(10, 3) NOT NULL DEFAULT 0,
    par_quantity     NUMERIC(10, 3),
    cost_per_unit    NUMERIC(10, 2),
    notes            TEXT,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_business
    ON inventory_items(business_id);

CREATE INDEX IF NOT EXISTS idx_inventory_items_low_stock
    ON inventory_items(business_id, current_quantity, par_quantity);

CREATE TRIGGER update_inventory_items_updated_at
    BEFORE UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Stock Movements ──────────────────────────────────────────────────────────
-- Full audit log of every stock change. quantity_delta is positive for inbound
-- (receive) and negative for outbound (waste). adjust can be either sign.
-- alert_triggered is set to true on the movement that caused a par breach.

CREATE TABLE IF NOT EXISTS stock_movements (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID           NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    location_id     UUID           REFERENCES locations(id) ON DELETE SET NULL,
    item_id         UUID           NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    movement_type   VARCHAR(20)    NOT NULL CHECK (movement_type IN ('receive', 'adjust', 'waste')),
    quantity_delta  NUMERIC(10, 3) NOT NULL,
    notes           TEXT,
    created_by      UUID           REFERENCES users(id) ON DELETE SET NULL,
    alert_triggered BOOLEAN        NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item
    ON stock_movements(item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_business
    ON stock_movements(business_id, created_at DESC);

-- ─── Menu Item Ingredients (recipe stub) ─────────────────────────────────────
-- Links menu items to inventory items for future auto-deduction on order
-- placement. No order logic wires to this yet — FK stub only.

CREATE TABLE IF NOT EXISTS menu_item_ingredients (
    id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id      UUID           NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    inventory_item_id UUID           NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity          NUMERIC(10, 3) NOT NULL DEFAULT 1,
    unit              VARCHAR(50)    NOT NULL DEFAULT 'each',
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
    UNIQUE (menu_item_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_ingredients_menu_item
    ON menu_item_ingredients(menu_item_id);
