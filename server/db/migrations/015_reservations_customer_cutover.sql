-- Migration 015: Reservations customer cutover
-- Drops the legacy reservations.customer_id → users FK, renames
-- customer_id_new → customer_id, and removes the orphaned
-- users.user_type='customer' rows that were leftover from the (removed)
-- customer portal. Single-pass cutover; no parallel state remains.

-- Safety: every reservation must have customer_id_new populated by the
-- backfill script before this runs.
DO $$
DECLARE
    missing_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO missing_count
        FROM reservations
        WHERE customer_id_new IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION
            'Cannot cut over: % reservations still have NULL customer_id_new. '
            'Run `python -m db.backfill_customers` against this database first.',
            missing_count;
    END IF;
END $$;

-- Drop the index that referenced customer_id_new (gets recreated under the
-- new name below).
DROP INDEX IF EXISTS idx_reservations_customer_new;

-- Drop legacy FK + column. The FK name comes from PostgreSQL's default
-- naming; we use IF EXISTS to be safe across renamed/restored snapshots.
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_customer_id_fkey;
ALTER TABLE reservations DROP COLUMN customer_id;

-- Promote the new column.
ALTER TABLE reservations RENAME COLUMN customer_id_new TO customer_id;
ALTER TABLE reservations ALTER COLUMN customer_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_customer
    ON reservations(customer_id);

-- Drop orphaned customer User rows. The customer portal was removed in
-- Phase 5.8 and Phase A.5 migrated all reservation references off these
-- rows. Notifications addressed to these users (also a dead path —
-- nothing in the UI reads them) cascade-delete via FK.
DELETE FROM users WHERE user_type = 'customer';
