-- Stage 2: tenant-owned regional configuration and non-fiscal operational tax.
-- Germany is the initial editable default; no tax law is encoded in order reads.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE businesses
    ADD COLUMN country_code VARCHAR(2) NOT NULL DEFAULT 'DE',
    ADD COLUMN currency_code VARCHAR(3) NOT NULL DEFAULT 'EUR',
    ADD COLUMN locale VARCHAR(35) NOT NULL DEFAULT 'de-DE',
    ADD COLUMN tax_label VARCHAR(50) NOT NULL DEFAULT 'VAT';

ALTER TABLE businesses
    ADD CONSTRAINT ck_business_country_code CHECK (country_code ~ '^[A-Z]{2}$'),
    ADD CONSTRAINT ck_business_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT ck_business_locale CHECK (length(trim(locale)) >= 2),
    ADD CONSTRAINT ck_business_tax_label CHECK (length(trim(tax_label)) BETWEEN 1 AND 50);

CREATE TABLE business_regional_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    previous_values JSONB NOT NULL,
    new_values JSONB NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_business_regional_audits_business_changed
    ON business_regional_audits (business_id, changed_at DESC);

CREATE TABLE tax_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    code VARCHAR(40) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    archived_by UUID REFERENCES users(id) ON DELETE SET NULL,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tax_profiles_business_code UNIQUE (business_id, code),
    CONSTRAINT ck_tax_profiles_code CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'),
    CONSTRAINT ck_tax_profiles_archive_state CHECK (
        (is_active AND archived_at IS NULL) OR (NOT is_active AND archived_at IS NOT NULL)
    )
);

CREATE TRIGGER update_tax_profiles_updated_at
    BEFORE UPDATE ON tax_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE tax_profile_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_profile_id UUID NOT NULL REFERENCES tax_profiles(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    rate NUMERIC(7,4) NOT NULL,
    price_includes_tax BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from TIMESTAMPTZ NOT NULL,
    note TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tax_profile_versions_effective UNIQUE (tax_profile_id, effective_from),
    CONSTRAINT ck_tax_profile_versions_name CHECK (length(trim(name)) BETWEEN 1 AND 120),
    CONSTRAINT ck_tax_profile_versions_rate CHECK (rate >= 0 AND rate <= 100)
);
CREATE INDEX idx_tax_profile_versions_business_effective
    ON tax_profile_versions (business_id, effective_from DESC);

-- Existing tenants receive an explicit review-required profile. This preserves
-- ordering continuity without pretending their historical catalogue was classified.
INSERT INTO tax_profiles (id, business_id, code)
SELECT gen_random_uuid(), id, 'UNSPECIFIED'
FROM businesses;

INSERT INTO tax_profile_versions (
    tax_profile_id, business_id, name, rate, price_includes_tax, effective_from, note
)
SELECT id, business_id, 'Unspecified — review required', 0, TRUE,
       TIMESTAMPTZ '1970-01-01 00:00:00+00',
       'Migration fallback; owner or manager should assign an appropriate profile.'
FROM tax_profiles
WHERE code = 'UNSPECIFIED';

ALTER TABLE menu_items ADD COLUMN tax_profile_id UUID;
UPDATE menu_items mi
SET tax_profile_id = tp.id
FROM tax_profiles tp
WHERE tp.business_id = mi.business_id AND tp.code = 'UNSPECIFIED';
ALTER TABLE menu_items
    ALTER COLUMN tax_profile_id SET NOT NULL,
    ADD CONSTRAINT fk_menu_items_tax_profile
        FOREIGN KEY (tax_profile_id) REFERENCES tax_profiles(id) ON DELETE RESTRICT;
CREATE INDEX idx_menu_items_tax_profile ON menu_items(tax_profile_id);

ALTER TABLE item_library ADD COLUMN tax_profile_id UUID;
UPDATE item_library il
SET tax_profile_id = tp.id
FROM tax_profiles tp
WHERE tp.business_id = il.business_id AND tp.code = 'UNSPECIFIED';
ALTER TABLE item_library
    ALTER COLUMN tax_profile_id SET NOT NULL,
    ADD CONSTRAINT fk_item_library_tax_profile
        FOREIGN KEY (tax_profile_id) REFERENCES tax_profiles(id) ON DELETE RESTRICT;
CREATE INDEX idx_item_library_tax_profile ON item_library(tax_profile_id);

-- Currency-neutral storage supports ISO currencies with up to four operational
-- decimal places while presentation quantizes to the configured minor unit.
ALTER TABLE menu_items
    ALTER COLUMN price TYPE NUMERIC(18,4),
    ALTER COLUMN happy_hour_price TYPE NUMERIC(18,4);
ALTER TABLE modifiers ALTER COLUMN price_delta TYPE NUMERIC(18,4);
ALTER TABLE item_library ALTER COLUMN price TYPE NUMERIC(18,4);
ALTER TABLE inventory_items ALTER COLUMN cost_per_unit TYPE NUMERIC(18,4);
ALTER TABLE orders ALTER COLUMN total_amount TYPE NUMERIC(18,4);
ALTER TABLE order_line_items ALTER COLUMN unit_price TYPE NUMERIC(18,4);

ALTER TABLE orders
    ADD COLUMN currency_code VARCHAR(3),
    ADD COLUMN subtotal_amount NUMERIC(18,4),
    ADD COLUMN tax_amount NUMERIC(18,4);

UPDATE orders o
SET currency_code = b.currency_code,
    subtotal_amount = o.total_amount,
    tax_amount = 0
FROM businesses b
WHERE b.id = o.business_id;

ALTER TABLE orders
    ALTER COLUMN currency_code SET NOT NULL,
    ALTER COLUMN subtotal_amount SET NOT NULL,
    ALTER COLUMN tax_amount SET NOT NULL,
    ADD CONSTRAINT ck_orders_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT ck_orders_subtotal_nonnegative CHECK (subtotal_amount >= 0),
    ADD CONSTRAINT ck_orders_tax_nonnegative CHECK (tax_amount >= 0);

ALTER TABLE order_line_items
    ADD COLUMN currency_code VARCHAR(3),
    ADD COLUMN tax_profile_id UUID REFERENCES tax_profiles(id) ON DELETE SET NULL,
    ADD COLUMN tax_profile_version_id UUID REFERENCES tax_profile_versions(id) ON DELETE SET NULL,
    ADD COLUMN tax_profile_name VARCHAR(120),
    ADD COLUMN tax_profile_code VARCHAR(40),
    ADD COLUMN tax_rate NUMERIC(7,4),
    ADD COLUMN price_includes_tax BOOLEAN,
    ADD COLUMN subtotal_amount NUMERIC(18,4),
    ADD COLUMN tax_amount NUMERIC(18,4),
    ADD COLUMN total_amount NUMERIC(18,4);

UPDATE order_line_items li
SET currency_code = o.currency_code,
    tax_profile_name = 'Legacy operational amount',
    tax_profile_code = 'LEGACY',
    tax_rate = 0,
    price_includes_tax = TRUE,
    subtotal_amount = li.unit_price * li.quantity,
    tax_amount = 0,
    total_amount = li.unit_price * li.quantity
FROM orders o
WHERE o.id = li.order_id;

ALTER TABLE order_line_items
    ALTER COLUMN currency_code SET NOT NULL,
    ALTER COLUMN tax_profile_name SET NOT NULL,
    ALTER COLUMN tax_profile_code SET NOT NULL,
    ALTER COLUMN tax_rate SET NOT NULL,
    ALTER COLUMN price_includes_tax SET NOT NULL,
    ALTER COLUMN subtotal_amount SET NOT NULL,
    ALTER COLUMN tax_amount SET NOT NULL,
    ALTER COLUMN total_amount SET NOT NULL,
    ADD CONSTRAINT ck_order_lines_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT ck_order_lines_tax_rate CHECK (tax_rate >= 0 AND tax_rate <= 100),
    ADD CONSTRAINT ck_order_lines_amounts_nonnegative CHECK (
        subtotal_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0
    );
