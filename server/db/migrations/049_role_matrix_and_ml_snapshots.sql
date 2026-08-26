-- Stage 6 replaces the three-value role column with the fixed five-role pilot
-- matrix. Until now the system was effectively binary: 57 routes asked for
-- ('owner', 'manager') and everything else was open to any authenticated staff
-- member, so 'staff' could edit menu prices, settle tabs externally and record
-- stock movements. The five roles below are the operational roles the pilot
-- venue actually staffs, and every route is re-decided against a capability map
-- in app/core/permissions.py.
--
-- Existing 'staff' rows become 'host_server'. That is a deliberate narrowing,
-- not a lossless rename: a host/server no longer edits menu prices or posts
-- stock movements. An owner reassigns anyone who needs a different row from the
-- Staff page.

-- The 001 constraint is inline and therefore auto-named. Resolve it rather than
-- guessing, so this migration is safe against a database whose constraint was
-- created under a different name.
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'staff'
      AND nsp.nspname = current_schema()
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE staff DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

UPDATE staff SET role = 'host_server' WHERE role = 'staff';

ALTER TABLE staff
    ADD CONSTRAINT ck_staff_role CHECK (
        role IN ('owner', 'manager', 'host_server', 'bar_kitchen', 'inventory_operator')
    );

-- Pending invitations carry the same role vocabulary. 032 named its constraint,
-- so this one can be dropped directly.
ALTER TABLE staff_invitations
    DROP CONSTRAINT IF EXISTS ck_staff_invitations_role;

UPDATE staff_invitations SET role = 'host_server' WHERE role = 'staff';

ALTER TABLE staff_invitations
    ALTER COLUMN role SET DEFAULT 'host_server',
    ADD CONSTRAINT ck_staff_invitations_role CHECK (
        role IN ('owner', 'manager', 'host_server', 'bar_kitchen', 'inventory_operator')
    );

COMMENT ON COLUMN staff.role IS
    'Fixed MVP role. Capabilities are resolved in app/core/permissions.py, not stored here.';

-- Insights is an optional dashboard over a private ML service. Today a transport
-- failure raises 503 and the dashboard is empty until the next pipeline run, so a
-- restart of an optional service blanks a staff surface. Each successful read is
-- snapshotted per tenant and per resource; a later outage serves the snapshot
-- marked stale instead of failing. One row per (business, resource) — the newest
-- result replaces the previous one, because a history of dashboard payloads has
-- no reader.
CREATE TABLE ml_result_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    resource VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ml_result_snapshots_business_resource UNIQUE (business_id, resource),
    CONSTRAINT ck_ml_result_snapshots_resource CHECK (
        resource IN ('status', 'segmentation', 'cancellation', 'demand')
    )
);

CREATE INDEX idx_ml_result_snapshots_business
    ON ml_result_snapshots (business_id, captured_at DESC);

COMMENT ON TABLE ml_result_snapshots IS
    'Last successful per-tenant ML dashboard payload. Served with stale=true when the ML service is unreachable; never an input to an operational decision.';

-- Guests can now raise their own privacy requests through the reservation link
-- they already hold, so withdrawal joins the request vocabulary. The 029
-- constraint is inline and auto-named, so resolve it rather than guessing.
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'customer_data_requests'
      AND nsp.nspname = current_schema()
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%request_type%'
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE customer_data_requests DROP CONSTRAINT %I', constraint_name
        );
    END IF;
END $$;

ALTER TABLE customer_data_requests
    ADD CONSTRAINT ck_customer_data_requests_type CHECK (
        request_type IN ('export', 'correction', 'deletion', 'withdraw_consent')
    );

COMMENT ON COLUMN customer_data_requests.requested_by IS
    'The staff member who raised this. NULL when the guest raised it themselves through their reservation link.';
