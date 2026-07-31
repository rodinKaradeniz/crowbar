-- Rich guest CRM and EU-GDPR-oriented privacy foundations.
-- Historical operational records are retained but can be anonymised without
-- deleting the venue's aggregate service history.

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS preferences TEXT,
    ADD COLUMN IF NOT EXISTS dietary_details TEXT,
    ADD COLUMN IF NOT EXISTS dietary_details_source VARCHAR(32),
    ADD COLUMN IF NOT EXISTS dietary_details_recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS dietary_details_recorded_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS merged_into_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE customers
    DROP CONSTRAINT IF EXISTS ck_customers_dietary_details_provenance;
ALTER TABLE customers
    ADD CONSTRAINT ck_customers_dietary_details_provenance CHECK (
        (dietary_details IS NULL AND dietary_details_source IS NULL AND dietary_details_recorded_at IS NULL)
        OR
        (dietary_details IS NOT NULL AND dietary_details_source = 'guest_provided' AND dietary_details_recorded_at IS NOT NULL)
    );

-- Erasure replaces direct contact data with NULL while retaining an anonymous
-- operational record. New reservations still require contact details.
ALTER TABLE reservations
    ALTER COLUMN phone DROP NOT NULL,
    ALTER COLUMN email DROP NOT NULL;

CREATE TABLE IF NOT EXISTS customer_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customer_tag_name UNIQUE (customer_id, name)
);
CREATE INDEX IF NOT EXISTS idx_customer_tags_business_customer
    ON customer_tags (business_id, customer_id);

CREATE TABLE IF NOT EXISTS customer_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    title VARCHAR(120) NOT NULL,
    body TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_notes_business_customer
    ON customer_notes (business_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_marketing_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    channel VARCHAR(16) NOT NULL CHECK (channel IN ('email', 'sms')),
    is_consented BOOLEAN NOT NULL,
    source VARCHAR(32) NOT NULL,
    notice_version VARCHAR(32) NOT NULL,
    reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    withdrawn_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_customer_marketing_consent_channel UNIQUE (customer_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_customer_marketing_consents_business_customer
    ON customer_marketing_consents (business_id, customer_id);

CREATE TABLE IF NOT EXISTS customer_data_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    request_type VARCHAR(16) NOT NULL CHECK (request_type IN ('export', 'correction', 'deletion')),
    status VARCHAR(16) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed')),
    detail TEXT,
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_customer_data_requests_business_customer
    ON customer_data_requests (business_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_merge_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    source_customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    target_customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    merged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    merged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_customer_merge_distinct CHECK (source_customer_id <> target_customer_id)
);

DROP TRIGGER IF EXISTS trigger_update_customer_notes_updated_at ON customer_notes;
CREATE TRIGGER trigger_update_customer_notes_updated_at
BEFORE UPDATE ON customer_notes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
