-- Public production flows require venue-owned privacy contact information.
-- Existing tenants remain nullable so this append-only migration is safe; the
-- application refuses to expose their public production flows until configured.
ALTER TABLE businesses
    ADD COLUMN privacy_contact VARCHAR(255),
    ADD COLUMN privacy_policy_url VARCHAR(500);
