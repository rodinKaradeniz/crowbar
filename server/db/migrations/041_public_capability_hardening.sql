-- Public capabilities are stored as hashes, and a printed QR only bootstraps
-- a staff-approved browser session for the current seating.

ALTER TABLE queue_entries ADD COLUMN session_token_hash VARCHAR(64);
UPDATE queue_entries
SET session_token_hash = encode(sha256(convert_to(session_token, 'UTF8')), 'hex');
ALTER TABLE queue_entries ALTER COLUMN session_token_hash SET NOT NULL;
CREATE UNIQUE INDEX uq_queue_entries_session_token_hash
    ON queue_entries (session_token_hash);
ALTER TABLE queue_entries DROP COLUMN session_token;

ALTER TABLE orders ADD COLUMN session_token_hash VARCHAR(64);
UPDATE orders
SET session_token_hash = encode(sha256(convert_to(session_token, 'UTF8')), 'hex');
ALTER TABLE orders ALTER COLUMN session_token_hash SET NOT NULL;
CREATE INDEX idx_orders_business_session_token_hash
    ON orders (business_id, session_token_hash, placed_at DESC);
ALTER TABLE orders DROP COLUMN session_token;

CREATE TABLE table_guest_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    table_id UUID NOT NULL REFERENCES tables(id) ON DELETE RESTRICT,
    seating_id UUID NOT NULL REFERENCES table_seatings(id) ON DELETE CASCADE,
    table_qr_revision INTEGER NOT NULL,
    browser_nonce_hash VARCHAR(64) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_table_guest_session_token UNIQUE (token_hash),
    CONSTRAINT ck_table_guest_session_status
        CHECK (status IN ('pending', 'approved', 'denied', 'revoked')),
    CONSTRAINT ck_table_guest_session_revision CHECK (table_qr_revision > 0),
    CONSTRAINT ck_table_guest_session_decision CHECK (
        (status = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
        OR (status <> 'pending' AND decided_at IS NOT NULL)
    )
);
CREATE UNIQUE INDEX uq_table_guest_session_seating_browser
    ON table_guest_sessions (business_id, seating_id, browser_nonce_hash);
CREATE INDEX idx_table_guest_sessions_staff_queue
    ON table_guest_sessions (business_id, status, created_at);
CREATE INDEX idx_table_guest_sessions_expiry
    ON table_guest_sessions (expires_at)
    WHERE status IN ('pending', 'approved');
CREATE TRIGGER update_table_guest_sessions_updated_at
    BEFORE UPDATE ON table_guest_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add database-level tenant alignment for the new authorization boundary.
ALTER TABLE locations ADD CONSTRAINT uq_locations_id_business UNIQUE (id, business_id);
ALTER TABLE tables ADD CONSTRAINT uq_tables_id_business UNIQUE (id, business_id);
ALTER TABLE table_seatings ADD CONSTRAINT uq_table_seatings_id_business UNIQUE (id, business_id);
ALTER TABLE table_guest_sessions
    ADD CONSTRAINT fk_table_guest_session_location_tenant
        FOREIGN KEY (location_id, business_id)
        REFERENCES locations(id, business_id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_table_guest_session_table_tenant
        FOREIGN KEY (table_id, business_id)
        REFERENCES tables(id, business_id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_table_guest_session_seating_tenant
        FOREIGN KEY (seating_id, business_id)
        REFERENCES table_seatings(id, business_id) ON DELETE CASCADE;
