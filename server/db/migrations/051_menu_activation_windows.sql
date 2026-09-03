-- Migration 051: menus own their own activation windows.
--
-- "Happy hour" was spread across three mechanisms that did not know about each
-- other: happy_hour_windows (business-wide days + times, migration 017),
-- menu_items.happy_hour_price (a second price column on the item), and a menu
-- literally named "Happy Hour" whose schedule lived as prose in its
-- description. This collapses all three into one idea — a menu is either always
-- on, or it has one or more windows.
--
-- Happy hour then stops being a feature and becomes what it always was: a menu
-- with a window and lower prices on some items. Breakfast, late-night and
-- seasonal menus fall out of the same mechanism.
--
-- NOTHING IS LOST. menu_items.category_id points at menu_categories.menu_id, so
-- an item already belongs to exactly one menu and carries exactly one price; a
-- discounted item is an item in a windowed menu at a lower price, which is why
-- happy_hour_price is DROPPED rather than reshaped. Verified before writing
-- this file: the canonical seed has zero happy_hour_windows rows and sets
-- happy_hour_price on zero items, and no deployment has run past migration 022.
--
-- menus.is_active already exists and remains the general on/off. A window
-- narrows when an active menu is served; it is not a second enable flag.

-- menu_items already carries uq_menu_items_id_business (migration 042); menus
-- was missed, and a tenant-aligned composite FK cannot point at menus without
-- it. Same pattern as 042's fk_menu_availability_item_tenant.
ALTER TABLE menus ADD CONSTRAINT uq_menus_id_business UNIQUE (id, business_id);

CREATE TABLE menu_activation_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id UUID NOT NULL,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    days_of_week INT[] NOT NULL,  -- 0=Monday..6=Sunday (server/app/constants/days.py)
    start_time TIME NOT NULL,     -- wall clock in businesses.timezone, never UTC
    end_time TIME NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- The window belongs to the menu AND to the menu's tenant; a composite FK
    -- makes it impossible to attach one business's window to another's menu.
    CONSTRAINT fk_menu_activation_window_menu_tenant
        FOREIGN KEY (menu_id, business_id)
        REFERENCES menus(id, business_id) ON DELETE CASCADE,
    CONSTRAINT ck_menu_activation_window_days CHECK (
        days_of_week <@ ARRAY[0, 1, 2, 3, 4, 5, 6]
        AND array_length(days_of_week, 1) BETWEEN 1 AND 7
    ),
    -- start_time > end_time is a VALID overnight window (Friday 22:00-02:00
    -- runs Friday 22:00-23:59:59 and Saturday 00:00-02:00). Only equality is
    -- meaningless, because it names a zero-length window.
    CONSTRAINT ck_menu_activation_window_times CHECK (start_time <> end_time)
);

CREATE INDEX idx_menu_activation_windows_menu
    ON menu_activation_windows (menu_id);

CREATE TRIGGER update_menu_activation_windows_updated_at
    BEFORE UPDATE ON menu_activation_windows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Business-wide happy hour is gone; a window now belongs to a menu.
DROP TABLE happy_hour_windows;

-- The second price column is gone; a discounted item is an item in a windowed
-- menu at a lower price.
ALTER TABLE menu_items DROP COLUMN happy_hour_price;
