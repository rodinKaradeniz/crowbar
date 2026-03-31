-- 003_online_reservations.sql
-- Adds online reservation support, pending-enabled flag, meeting links, and Google OAuth tokens

-- Service types: online meeting flag and pending-enabled flag
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS is_pending_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Reservations: meeting link for online sessions
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS meeting_link VARCHAR(500);

-- Google OAuth tokens (per business, for Calendar API / Meet links)
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_oauth_tokens_business_id ON google_oauth_tokens(business_id);

-- Apply updated_at trigger for google_oauth_tokens
DROP TRIGGER IF EXISTS trigger_update_google_oauth_tokens_updated_at ON google_oauth_tokens;
CREATE TRIGGER trigger_update_google_oauth_tokens_updated_at
  BEFORE UPDATE ON google_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
