# Ordering module (Phase 2) — COMPLETE
# QR-based customer ordering, menu management, kitchen/bar ticket board.
# Module guard: require_module("ordering") on all routes in this module.
#
# Key files:
#   server/app/routers/ordering.py          — REST + WebSocket endpoints
#   server/app/services/menu_service.py     — menu/category/item CRUD
#   server/app/services/order_service.py    — order placement, status transitions
#   server/app/services/order_ws_manager.py — WebSocket broadcast manager
#   server/app/models/menu.py               — Menu, MenuCategory, MenuItem, ModifierGroup, Modifier
#   server/app/models/order.py              — Order, OrderLineItem, OrderStatusTimeline
#   server/db/migrations/008_ordering.sql   — all ordering tables
