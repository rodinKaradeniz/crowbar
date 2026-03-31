-- Ordering module tables: menus, categories, items, modifiers, orders, line items, status timeline

-- ─── Menus ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menus (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_id  UUID         REFERENCES locations(id) ON DELETE SET NULL,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menus_business_active
  ON menus(business_id, is_active);

-- ─── Menu Categories ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_categories (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id       UUID         NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  business_id   UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  display_order INTEGER      NOT NULL DEFAULT 0,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_menu
  ON menu_categories(menu_id, display_order);

-- ─── Menu Items ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_items (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id      UUID           NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  business_id      UUID           NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name             VARCHAR(255)   NOT NULL,
  description      TEXT,
  price            NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_available     BOOLEAN        NOT NULL DEFAULT true,
  routing_tag      VARCHAR(20)    NOT NULL DEFAULT 'kitchen'
                     CHECK (routing_tag IN ('kitchen', 'bar', 'any')),
  prep_time_minutes INTEGER,
  display_order    INTEGER        NOT NULL DEFAULT 0,
  image            TEXT,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_category
  ON menu_items(category_id, display_order);

CREATE INDEX IF NOT EXISTS idx_menu_items_business_available
  ON menu_items(business_id, is_available);

-- ─── Modifier Groups ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modifier_groups (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID         NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  business_id UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  required    BOOLEAN      NOT NULL DEFAULT false,
  min_select  INTEGER      NOT NULL DEFAULT 0,
  max_select  INTEGER      NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modifier_groups_item
  ON modifier_groups(item_id);

-- ─── Modifiers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modifiers (
  id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID           NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  business_id  UUID           NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         VARCHAR(255)   NOT NULL,
  price_delta  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_available BOOLEAN        NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modifiers_group
  ON modifiers(group_id);

-- ─── Orders ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID           NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_id      UUID           REFERENCES locations(id) ON DELETE SET NULL,
  session_token    VARCHAR(64)    NOT NULL,
  table_identifier VARCHAR(100),
  status           VARCHAR(20)    NOT NULL DEFAULT 'received'
                     CHECK (status IN ('received', 'preparing', 'ready', 'served', 'cancelled')),
  idempotency_key  VARCHAR(100)   NOT NULL UNIQUE,
  total_amount     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  notes            TEXT,
  placed_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_business_status
  ON orders(business_id, status, placed_at);

CREATE INDEX IF NOT EXISTS idx_orders_session_token
  ON orders(business_id, session_token);

-- ─── Order Line Items ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_line_items (
  id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID           NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id             UUID           REFERENCES menu_items(id) ON DELETE SET NULL,
  item_name           VARCHAR(255)   NOT NULL,
  quantity            INTEGER        NOT NULL DEFAULT 1,
  unit_price          NUMERIC(10, 2) NOT NULL DEFAULT 0,
  selected_modifiers  JSONB          NOT NULL DEFAULT '[]',
  routing_tag         VARCHAR(20)    NOT NULL DEFAULT 'kitchen',
  notes               TEXT,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_line_items_order
  ON order_line_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_line_items_routing
  ON order_line_items(order_id, routing_tag);

-- ─── Order Status Timeline ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_status_timeline (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     VARCHAR(20) NOT NULL,
  changed_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_timeline_order
  ON order_status_timeline(order_id, changed_at);

-- ─── Auto-update updated_at triggers ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_menus_updated_at'
  ) THEN
    CREATE TRIGGER update_menus_updated_at
      BEFORE UPDATE ON menus
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_menu_categories_updated_at'
  ) THEN
    CREATE TRIGGER update_menu_categories_updated_at
      BEFORE UPDATE ON menu_categories
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_menu_items_updated_at'
  ) THEN
    CREATE TRIGGER update_menu_items_updated_at
      BEFORE UPDATE ON menu_items
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_modifier_groups_updated_at'
  ) THEN
    CREATE TRIGGER update_modifier_groups_updated_at
      BEFORE UPDATE ON modifier_groups
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_modifiers_updated_at'
  ) THEN
    CREATE TRIGGER update_modifiers_updated_at
      BEFORE UPDATE ON modifiers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_orders_updated_at'
  ) THEN
    CREATE TRIGGER update_orders_updated_at
      BEFORE UPDATE ON orders
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_order_line_items_updated_at'
  ) THEN
    CREATE TRIGGER update_order_line_items_updated_at
      BEFORE UPDATE ON order_line_items
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;
