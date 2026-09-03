-- Migration 052: a staff account can be erased, not only switched off.
--
-- POST /api/auth/disable-account already sets is_active = false and bumps
-- session_version, but the row, the name, the email and the phone all stay.
-- That is deactivation. It remains a feature and is untouched here. Nothing in
-- the product erased a person, and GDPR Art. 17 is not answered by a flag.
--
-- Erasure is ANONYMIZATION, not DELETE. Measured against this database before
-- writing the file: 48 foreign keys reference users(id) -- 43 ON DELETE SET
-- NULL, 3 ON DELETE CASCADE (staff.user_id, notifications.user_id,
-- password_reset_tokens.user_id) and 2 with no delete action at all
-- (tabs.opened_by, tabs.closed_by). A plain DELETE would empty forty-three
-- audit trails, turning "Theo settled Tisch 2 at 19:52" into "somebody did",
-- and tabs.opened_by is NOT NULL with no ON DELETE, so the delete would be
-- refused anyway. Scrubbing the person and keeping the row satisfies Art. 17 --
-- a row that cannot identify anyone is no longer personal data -- while the
-- operational record stays intact.
--
-- Two columns and no new table. customer_data_requests is customer-scoped
-- (customer_id NOT NULL REFERENCES customers ON DELETE RESTRICT, migration 029)
-- and cannot hold a staff record; the user row carrying anonymized_at IS the
-- record of the erasure.
--
-- No index. One venue, a users table in the low tens of rows, and the job's
-- predicate scans it sequentially either way.

ALTER TABLE users
    ADD COLUMN deletion_requested_at TIMESTAMPTZ,
    ADD COLUMN anonymized_at         TIMESTAMPTZ;

-- A row cannot be erased without a request having been made. deletion_requested_at
-- is deliberately KEPT after erasure rather than cleared: when the person asked
-- is the part of the record worth having, and keeping it makes this check a
-- simple implication rather than a mutual exclusion.
ALTER TABLE users
    ADD CONSTRAINT ck_users_anonymized_requires_request
        CHECK (anonymized_at IS NULL OR deletion_requested_at IS NOT NULL);

COMMENT ON COLUMN users.deletion_requested_at IS
    'When the user asked to be erased. The 30-day grace window runs from here; is_active stays true and the account keeps working. Cleared when the user signs in again.';
COMMENT ON COLUMN users.anonymized_at IS
    'When the erasure happened. A row with this set is the audit record of a former staff member and identifies nobody.';
