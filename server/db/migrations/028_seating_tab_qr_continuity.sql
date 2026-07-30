-- Registered-table ordering and tab continuity.
-- Existing tabs and free-text order labels remain valid historical records.

ALTER TABLE tabs
    ADD COLUMN IF NOT EXISTS seating_id UUID REFERENCES table_seatings(id) ON DELETE RESTRICT;

ALTER TABLE tabs
    ALTER COLUMN opened_by DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tabs_seating
    ON tabs (business_id, seating_id)
    WHERE seating_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_open_tab_per_seating
    ON tabs (seating_id)
    WHERE seating_id IS NOT NULL AND status = 'open';
