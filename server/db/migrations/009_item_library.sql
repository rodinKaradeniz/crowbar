-- Migration 009: Item library + ordering on/off toggle

-- ─── Item Library ──────────────────────────────────────────────────────────────
-- Reusable item templates scoped per business. Items are COPIED (not linked)
-- into menu categories via the add-to-category endpoint.

CREATE TABLE item_library (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id       UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name              VARCHAR(255) NOT NULL,
    description       TEXT,
    price             NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    routing_tag       VARCHAR(20) NOT NULL DEFAULT 'kitchen',
    prep_time_minutes INT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_item_library_business ON item_library (business_id);

CREATE TRIGGER update_item_library_updated_at
    BEFORE UPDATE ON item_library
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Ordering on/off toggle ────────────────────────────────────────────────────
-- Allows staff to pause all incoming orders without disabling the module.

ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS is_accepting_orders BOOLEAN NOT NULL DEFAULT TRUE;
