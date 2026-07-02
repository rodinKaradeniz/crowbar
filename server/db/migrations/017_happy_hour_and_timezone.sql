-- Migration 017: Business timezone + Happy Hour (Tier B)
--
-- Part 1 — Business timezone
--   Each business stores an IANA timezone name (e.g. 'Europe/Istanbul'), NOT a
--   raw UTC offset — offsets don't track DST, IANA names do. All wall-clock
--   interpretation (operating hours, happy-hour windows) is done against this
--   timezone. Existing rows default to 'UTC'.
--
-- Part 2 — Happy Hour
--   A business can define multiple happy-hour windows. A window applies
--   business-wide; individual menu items opt in by setting happy_hour_price
--   (a flat override price; NULL = never discounts). start_time/end_time are
--   wall-clock TIME values interpreted against businesses.timezone, never UTC.
--   days_of_week uses the canonical index convention 0=Monday..6=Sunday
--   (matches Python datetime.weekday(); see server/app/constants/days.py).

ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'UTC';

CREATE TABLE IF NOT EXISTS happy_hour_windows (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id  UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    days_of_week INT[]        NOT NULL,   -- 0=Monday..6=Sunday (Python weekday())
    start_time   TIME         NOT NULL,   -- wall-clock local time in businesses.timezone
    end_time     TIME         NOT NULL,
    is_active    BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_happy_hour_windows_business
    ON happy_hour_windows(business_id);

CREATE TRIGGER update_happy_hour_windows_updated_at
    BEFORE UPDATE ON happy_hour_windows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Flat happy-hour override price per menu item. NULL = item never discounts.
ALTER TABLE menu_items
    ADD COLUMN IF NOT EXISTS happy_hour_price NUMERIC(10, 2);
