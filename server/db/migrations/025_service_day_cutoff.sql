-- A venue's operational day may continue after local midnight. The host board
-- groups records by this configurable wall-clock cutoff in the business IANA
-- timezone rather than by UTC or browser-local calendar date.

ALTER TABLE businesses
    ADD COLUMN service_day_cutoff TIME WITHOUT TIME ZONE NOT NULL DEFAULT '05:00';
