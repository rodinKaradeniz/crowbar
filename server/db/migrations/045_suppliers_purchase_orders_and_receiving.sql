CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, contact_name VARCHAR(255), email VARCHAR(320), phone VARCHAR(50),
    address TEXT, notes TEXT, is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, business_id), UNIQUE (business_id, name)
);
CREATE TABLE supplier_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL, inventory_item_id UUID NOT NULL, supplier_sku VARCHAR(120), product_name VARCHAR(255) NOT NULL,
    pack_conversion_id UUID, lead_time_days INTEGER NOT NULL DEFAULT 0 CHECK (lead_time_days >= 0),
    last_price NUMERIC(18, 6), currency_code VARCHAR(3) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, business_id), UNIQUE (supplier_id, supplier_sku),
    FOREIGN KEY (supplier_id, business_id) REFERENCES suppliers(id, business_id) ON DELETE RESTRICT,
    FOREIGN KEY (inventory_item_id, business_id) REFERENCES inventory_items(id, business_id) ON DELETE RESTRICT,
    FOREIGN KEY (pack_conversion_id, business_id) REFERENCES inventory_pack_conversions(id, business_id) ON DELETE RESTRICT
);
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL, location_id UUID REFERENCES locations(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','ordered','partially_received','received','cancelled')),
    reference VARCHAR(120), expected_on DATE, note TEXT, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL, approved_at TIMESTAMPTZ, ordered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, business_id), UNIQUE (business_id, reference),
    FOREIGN KEY (supplier_id, business_id) REFERENCES suppliers(id, business_id) ON DELETE RESTRICT,
    FOREIGN KEY (location_id, business_id) REFERENCES locations(id, business_id) ON DELETE RESTRICT
);
CREATE TABLE purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL, supplier_product_id UUID, inventory_item_id UUID NOT NULL,
    description VARCHAR(255) NOT NULL, ordered_quantity NUMERIC(18, 3) NOT NULL CHECK (ordered_quantity > 0),
    received_quantity NUMERIC(18, 3) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    pack_conversion_id UUID NOT NULL, unit_price NUMERIC(18, 6) NOT NULL CHECK (unit_price >= 0), currency_code VARCHAR(3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, business_id),
    FOREIGN KEY (purchase_order_id, business_id) REFERENCES purchase_orders(id, business_id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_product_id, business_id) REFERENCES supplier_products(id, business_id) ON DELETE RESTRICT,
    FOREIGN KEY (inventory_item_id, business_id) REFERENCES inventory_items(id, business_id) ON DELETE RESTRICT,
    FOREIGN KEY (pack_conversion_id, business_id) REFERENCES inventory_pack_conversions(id, business_id) ON DELETE RESTRICT
);
CREATE TABLE purchase_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL, delivery_reference VARCHAR(120), invoice_reference VARCHAR(120), received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    received_by UUID REFERENCES users(id) ON DELETE SET NULL, idempotency_key VARCHAR(100) NOT NULL, note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (id, business_id), UNIQUE (business_id, idempotency_key),
    FOREIGN KEY (purchase_order_id, business_id) REFERENCES purchase_orders(id, business_id) ON DELETE RESTRICT
);
CREATE TABLE purchase_receipt_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    receipt_id UUID NOT NULL, purchase_order_line_id UUID NOT NULL, inventory_item_id UUID NOT NULL,
    received_quantity NUMERIC(18, 3) NOT NULL CHECK (received_quantity > 0), unit_price NUMERIC(18, 6) NOT NULL CHECK (unit_price >= 0),
    currency_code VARCHAR(3) NOT NULL, substitution_note TEXT, discrepancy_reason TEXT, stock_movement_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (receipt_id, business_id) REFERENCES purchase_receipts(id, business_id) ON DELETE CASCADE,
    FOREIGN KEY (purchase_order_line_id, business_id) REFERENCES purchase_order_lines(id, business_id) ON DELETE RESTRICT,
    FOREIGN KEY (inventory_item_id, business_id) REFERENCES inventory_items(id, business_id) ON DELETE RESTRICT,
    FOREIGN KEY (stock_movement_id) REFERENCES stock_movements(id) ON DELETE RESTRICT
);
CREATE TABLE purchase_order_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL, object_key TEXT NOT NULL, filename VARCHAR(255) NOT NULL, content_type VARCHAR(120), byte_size BIGINT CHECK (byte_size >= 0),
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (purchase_order_id, business_id) REFERENCES purchase_orders(id, business_id) ON DELETE CASCADE
);
CREATE TABLE purchase_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    supplier_product_id UUID, inventory_item_id UUID NOT NULL, receipt_line_id UUID, unit_price NUMERIC(18,6) NOT NULL, currency_code VARCHAR(3) NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (supplier_product_id, business_id) REFERENCES supplier_products(id, business_id) ON DELETE SET NULL,
    FOREIGN KEY (inventory_item_id, business_id) REFERENCES inventory_items(id, business_id) ON DELETE RESTRICT
);
CREATE INDEX idx_po_tenant_status ON purchase_orders(business_id, status, updated_at DESC);
CREATE INDEX idx_price_history_tenant_item ON purchase_price_history(business_id, inventory_item_id, observed_at DESC);
