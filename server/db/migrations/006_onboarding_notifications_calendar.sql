-- =============================================================================
-- Migration 006: Phase 1 Foundation
-- =============================================================================
-- Adds:
--   businesses.onboarding_complete   — tracks first-login wizard completion
--   businesses.notification_channels — which channels (email, sms) are active
--   reservations.google_calendar_event_id — stores GCal event ID for sync
--
-- NOTE: Existing businesses will have onboarding_complete = FALSE after this
-- migration, which will redirect them to the onboarding wizard.
-- To skip existing businesses (e.g. in production), run after applying:
--   UPDATE businesses SET onboarding_complete = TRUE;
-- =============================================================================

-- Onboarding state: FALSE means wizard not yet completed
ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE;

-- Active notification channels; default email-only
ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS notification_channels JSONB NOT NULL DEFAULT '["email"]'::jsonb;

-- Google Calendar event ID stored per-reservation for update/delete sync
ALTER TABLE reservations
    ADD COLUMN IF NOT EXISTS google_calendar_event_id VARCHAR(255);
