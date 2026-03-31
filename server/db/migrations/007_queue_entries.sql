-- Queue entries table for walk-in / waitlist queue
CREATE TABLE IF NOT EXISTS queue_entries (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_id    UUID         REFERENCES locations(id) ON DELETE SET NULL,
  session_token  VARCHAR(64)  NOT NULL UNIQUE,
  name           VARCHAR(255) NOT NULL,
  party_size     INTEGER      NOT NULL DEFAULT 1,
  phone          VARCHAR(50),
  status         VARCHAR(20)  NOT NULL DEFAULT 'waiting',
  -- status: waiting | called | seated | removed
  joined_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  called_at      TIMESTAMPTZ,
  seated_at      TIMESTAMPTZ,
  removed_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queue_entries_business_status
  ON queue_entries(business_id, status, joined_at);

-- Auto-update updated_at on row changes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_queue_entries_updated_at'
  ) THEN
    CREATE TRIGGER update_queue_entries_updated_at
      BEFORE UPDATE ON queue_entries
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;
