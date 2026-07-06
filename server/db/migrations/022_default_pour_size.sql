-- Migration 022: Optional reference pour size for bottle/keg inventory items
--
-- Adds a per-item reference pour size (ml) used ONLY to produce a rough staff-
-- facing "pours remaining" estimate: floor(current_quantity / default_pour_ml).
-- It is deliberately independent of any actual recipe — a generic reference size,
-- not what a specific cocktail pours — so this number is an approximation (unlike
-- the recipe-exact menu-item "servings remaining", which is computed from
-- menu_item_ingredients and stored nowhere either).
--
-- Nullable with NO default: an unset value means "we don't have an estimate", not
-- a fabricated fallback. When NULL, the frontend shows no pours estimate at all.
-- Only meaningful for bottle/keg (ml-tracked) items; 'each' items leave it NULL.
-- Precision matches container_volume_ml (NUMERIC(10,3), ml-canonical).
--
-- No count is stored — pours remaining is computed live client-side from
-- current_quantity + default_pour_ml (same compute-on-demand pattern as the tab
-- total and is_happy_hour_active).

ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS default_pour_ml NUMERIC(10, 3) NULL;
