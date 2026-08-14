CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1,
    ADD CONSTRAINT ck_users_session_version_positive CHECK (session_version > 0);

ALTER TABLE staff_invitations
    ADD COLUMN token_hash VARCHAR(64),
    ADD COLUMN revoked_at TIMESTAMPTZ,
    ADD COLUMN sent_at TIMESTAMPTZ,
    ADD COLUMN delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    ADD COLUMN delivery_error TEXT,
    ADD COLUMN invited_by UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE staff_invitations
SET token_hash = encode(digest(token, 'sha256'), 'hex'),
    delivery_status = 'sent',
    sent_at = created_at;

ALTER TABLE staff_invitations
    ALTER COLUMN token_hash SET NOT NULL,
    ADD CONSTRAINT uq_staff_invitations_token_hash UNIQUE (token_hash),
    ADD CONSTRAINT ck_staff_invitations_role
        CHECK (role IN ('owner', 'manager', 'staff')),
    ADD CONSTRAINT ck_staff_invitations_delivery_status
        CHECK (delivery_status IN ('pending', 'sent', 'failed')),
    DROP COLUMN token;

CREATE UNIQUE INDEX uq_staff_invitations_pending_email
    ON staff_invitations (business_id, lower(email))
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_tokens_user
    ON password_reset_tokens(user_id);
