-- Migration 053: prove that an account's email address belongs to its owner.
--
-- Nothing in this codebase verified an email address. users had no verification
-- column and no route issued or consumed a verification token. Two paths made
-- that a real hole rather than a missing nicety:
--
--   POST /api/auth/register-business  created the owner account with whatever
--       address was typed.
--   POST /api/auth/change-email       checked the current password, then wrote
--       current_user.email = data.new_email and committed. No proof the account
--       holder controls the new address.
--
-- Combined with POST /api/auth/forgot-password, which sends a reset link to
-- whatever address is on the account, an unproven address becomes a password-
-- recovery channel. Closing that is the point of this migration.
--
-- Staff who join by invitation are deliberately NOT covered here: they clicked
-- a tokenised link sent to their address, which already proves control, so
-- routers/staff.py stamps them verified at the moment they accept. Asking them
-- to prove it twice would be theatre.
--
-- Guests are out of scope entirely. A guest is not an account; booking a table
-- is not a signup, and there is no credential to recover.
--
-- SHAPE. email_verification_tokens is password_reset_tokens (migration 032)
-- with one column added, deliberately rather than incidentally: cloning the
-- proven mechanism beats inventing a second one. The added column is new_email.
--
--   new_email IS NULL      -- prove the address already on users.email
--   new_email IS NOT NULL  -- a REQUESTED change, not yet applied
--
-- The pending address lives on the TOKEN, not on users, and that placement is
-- load-bearing. If it lived on users as a single pending_email column, a user
-- who requests a change to A and then to B would leave the still-live A token
-- able to apply B. Keeping the address on the row that proves it makes each
-- token authoritative for exactly the address it was mailed to.
--
-- users.email is NOT written until a token is consumed. That is the entire
-- point: the account keeps its current address, and its password recovery,
-- until the new one is proved.
--
-- No index beyond the two below. One venue, a users table in the low tens of
-- rows; token_hash's UNIQUE constraint already serves the only hot lookup.

ALTER TABLE users
    ADD COLUMN email_verified_at TIMESTAMPTZ;

-- Every account that exists right now is grandfathered as verified. These
-- addresses were never proved, but they are already in use, already receive
-- password resets, and the alternative is locking the pilot venue and every
-- seeded demo account out of their own workspace to fix a gap they did not
-- create. now() records when they were grandfathered, not a proof that never
-- happened -- the honest reading of this column for those rows is "not asked",
-- not "confirmed by the account holder".
UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL;

COMMENT ON COLUMN users.email_verified_at IS
    'When the account holder proved control of users.email, by consuming a token mailed to it. NULL means unverified: the account still signs in and works -- login is deliberately not gated -- but the workspace prompts for verification. Rows predating migration 053 carry that migration''s timestamp and were grandfathered, not proved.';

CREATE TABLE email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    new_email VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_verification_tokens_user
    ON email_verification_tokens(user_id);

COMMENT ON COLUMN email_verification_tokens.new_email IS
    'NULL to verify the address already on the user. Set to hold a REQUESTED email change that has not been applied: users.email keeps its old value until this token is consumed. The address lives here rather than on users so that a superseded token can never apply a newer request.';
COMMENT ON COLUMN email_verification_tokens.token_hash IS
    'SHA-256 of the raw token. The raw value is mailed once and never stored, matching password_reset_tokens.';
