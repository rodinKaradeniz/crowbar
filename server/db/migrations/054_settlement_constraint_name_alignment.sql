-- Align the tabs -> tab_settlement_events foreign key with the name the ORM
-- declares for it.
--
-- app/models/tab.py gives this FK an explicit name and use_alter=True, which is
-- what lets SQLAlchemy metadata teardown break the tabs <-> tab_settlement_events
-- cycle: it emits a standalone ALTER TABLE ... DROP CONSTRAINT by that exact
-- name. Migration 040 added the column with an inline unnamed REFERENCES, so a
-- migration-built database carried the PostgreSQL auto-name instead and the two
-- schema authorities disagreed about what the constraint is called.
--
-- Guarded so this is a no-op on a database whose schema came from create_all,
-- where the ORM name is already in place. Renaming a constraint is catalog-only:
-- no table rewrite and no validation scan.
--
-- This does not touch fk_tabs_current_settlement_tenant, the separate composite
-- tenant-scoped foreign key added by migration 042.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tabs_current_settlement_event_id_fkey'
          AND conrelid = 'tabs'::regclass
    ) THEN
        ALTER TABLE tabs
            RENAME CONSTRAINT tabs_current_settlement_event_id_fkey
                           TO fk_tabs_current_settlement_event;
    END IF;
END $$;
