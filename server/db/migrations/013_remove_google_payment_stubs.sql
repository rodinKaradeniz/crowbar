-- Migration 013: Remove Google OAuth/Calendar/Meet and payment stubs
-- Drops tables and columns that are out of scope for a bar/restaurant platform.

-- ─── Google OAuth tokens ──────────────────────────────────────────────────────
DROP TABLE IF EXISTS google_oauth_tokens;

-- ─── Reservations: remove Google Calendar, Meet, and payment columns ──────────
ALTER TABLE reservations
    DROP COLUMN IF EXISTS meeting_link,
    DROP COLUMN IF EXISTS google_calendar_event_id,
    DROP COLUMN IF EXISTS payment_amount,
    DROP COLUMN IF EXISTS payment_status,
    DROP COLUMN IF EXISTS stripe_payment_intent_id,
    DROP COLUMN IF EXISTS custom_fields;

-- ─── Service types: remove online-meeting and payment columns ─────────────────
ALTER TABLE service_types
    DROP COLUMN IF EXISTS is_online,
    DROP COLUMN IF EXISTS requires_payment,
    DROP COLUMN IF EXISTS amount,
    DROP COLUMN IF EXISTS form_fields;
