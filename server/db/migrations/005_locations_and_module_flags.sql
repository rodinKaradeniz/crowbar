-- 005_phase0_foundation.sql
-- Phase 0: tenant foundations
--   1. locations table (multi-location support, nullable FK on domain rows)
--   2. enabled_modules JSONB on businesses
--   3. location_id (nullable) on reservations — future tables follow the same pattern

-- ─── Locations ────────────────────────────────────────────────────────────────
-- A business may have one or more physical locations.
-- Single-location businesses will have one row here and can optionally ignore it.

CREATE TABLE IF NOT EXISTS locations (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    address     TEXT,
    phone       VARCHAR(50),
    is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_locations_business_id ON locations(business_id);

-- Only one primary location per business
CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_business_primary
    ON locations(business_id)
    WHERE is_primary = TRUE;

-- ─── Enabled modules on businesses ───────────────────────────────────────────
-- Stores the list of modules a business has enabled, e.g.:
--   ["reservations", "queue", "ordering", "inventory", "insights"]
-- Defaults to all platform modules enabled (for existing businesses and dev seeds).

ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS enabled_modules JSONB NOT NULL
        DEFAULT '["reservations", "queue", "ordering", "inventory", "insights"]';

-- ─── location_id on reservations (nullable) ───────────────────────────────────
-- Single-location businesses leave this null; multi-location set it explicitly.

ALTER TABLE reservations
    ADD COLUMN IF NOT EXISTS location_id UUID
        REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_location_id
    ON reservations(location_id)
    WHERE location_id IS NOT NULL;

-- ─── updated_at trigger for locations ────────────────────────────────────────
DROP TRIGGER IF EXISTS trigger_update_locations_updated_at ON locations;
CREATE TRIGGER trigger_update_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
