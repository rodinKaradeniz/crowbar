-- Marking a reservation as a no-show has never been able to succeed on a
-- migrated database. `reservations.status` has been restricted to four values
-- since 001, where the CHECK was written inline on the column and is therefore
-- auto-named. Migration 030 then added ck_reservations_no_show_audit, which is
-- only satisfiable when the status is 'no_show', and
-- reservation_service.mark_reservation_no_show writes exactly that value — so
-- the write violates the older, narrower check every time.
--
-- The suite could not see it. tests/conftest.py builds its schema from
-- Base.metadata rather than from this migration chain, and the ORM model
-- declared no status check at all, so every no-show assertion ran against a
-- database where the constraint did not exist. The matching CheckConstraint is
-- added to app/models/reservation.py in the same change; without it this file
-- stays invisible to pytest.
--
-- 'no_show' is the only value the codebase writes that the old check forbids.
-- The others are 'pending'/'confirmed' (reservation_service), 'cancelled'
-- (reservation_service) and 'completed' (floor_plan_service). The check is not
-- widened past what the code actually writes.

-- The 001 constraint is inline and therefore auto-named, so resolve it rather
-- than guessing, the same way 049 resolves the staff role check.
--
-- Match on the constraint's column set, NOT on its text. Several reservation
-- checks mention `status` in their definition — ck_reservations_no_show_audit
-- covers (status, no_show_at) — so a definition ILIKE '%status%' would happily
-- drop the wrong one. The status check is the only one whose columns are
-- exactly (status), which excludes every audit constraint by construction.
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'reservations'
      AND nsp.nspname = current_schema()
      AND con.contype = 'c'
      AND con.conkey = ARRAY[(
          SELECT att.attnum
          FROM pg_attribute att
          WHERE att.attrelid = rel.oid
            AND att.attname = 'status'
      )]::smallint[]
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE reservations DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

-- Named on the ck_<table>_<thing> convention 049 established, rather than
-- leaving another auto-named constraint for the next migration to hunt for.
-- The new set is a strict superset of the old one, so no existing row can
-- violate it — and ADD CONSTRAINT validates the table as it runs, so this
-- statement succeeding is the proof rather than an assumption.
ALTER TABLE reservations
    DROP CONSTRAINT IF EXISTS ck_reservations_status,
    ADD CONSTRAINT ck_reservations_status CHECK (
        status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')
    );

COMMENT ON COLUMN reservations.status IS
    'Lifecycle status. ck_reservations_status is the authority; ck_reservations_no_show_audit ties ''no_show'' to no_show_at.';
