-- Close the remaining Stage 3-4 database tenant-alignment gaps. Application
-- queries still require explicit business_id predicates; these constraints are
-- a final persistence backstop, not a replacement for route/service scoping.

ALTER TABLE order_line_items ADD COLUMN business_id UUID;
UPDATE order_line_items li
SET business_id = o.business_id
FROM orders o
WHERE o.id = li.order_id;
ALTER TABLE order_line_items ALTER COLUMN business_id SET NOT NULL;

ALTER TABLE order_status_timeline ADD COLUMN business_id UUID;
UPDATE order_status_timeline timeline
SET business_id = o.business_id
FROM orders o
WHERE o.id = timeline.order_id;
ALTER TABLE order_status_timeline ALTER COLUMN business_id SET NOT NULL;

-- Abort before adding any tenant constraint if a populated relationship is
-- already misaligned. A failed migration therefore identifies data that needs
-- explicit repair instead of silently blessing it.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM queue_service_days child
        JOIN locations parent ON parent.id = child.location_id
        WHERE parent.business_id <> child.business_id
    ) OR EXISTS (
        SELECT 1 FROM queue_entry_events child
        JOIN queue_entries parent ON parent.id = child.queue_entry_id
        WHERE parent.business_id <> child.business_id
    ) OR EXISTS (
        SELECT 1 FROM delivery_attempts child
        LEFT JOIN reservations r ON r.id = child.reservation_id
        LEFT JOIN queue_entries q ON q.id = child.queue_entry_id
        LEFT JOIN reservation_waitlist_entries w ON w.id = child.waitlist_entry_id
        WHERE COALESCE(r.business_id, q.business_id, w.business_id) <> child.business_id
    ) OR EXISTS (
        SELECT 1 FROM reservation_waitlist_entries child
        JOIN service_types parent ON parent.id = child.service_type_id
        WHERE parent.business_id <> child.business_id
    ) OR EXISTS (
        SELECT 1 FROM reservation_waitlist_entries child
        JOIN customers parent ON parent.id = child.customer_id
        WHERE parent.business_id <> child.business_id
    ) OR EXISTS (
        SELECT 1 FROM order_line_items child
        JOIN orders parent ON parent.id = child.order_id
        WHERE parent.business_id <> child.business_id
    ) OR EXISTS (
        SELECT 1 FROM order_status_timeline child
        JOIN orders parent ON parent.id = child.order_id
        WHERE parent.business_id <> child.business_id
    ) OR EXISTS (
        SELECT 1 FROM order_revisions child
        JOIN orders parent ON parent.id = child.order_id
        WHERE parent.business_id <> child.business_id
    ) OR EXISTS (
        SELECT 1 FROM menu_item_availability_events child
        JOIN menu_items parent ON parent.id = child.menu_item_id
        WHERE parent.business_id <> child.business_id
    ) OR EXISTS (
        SELECT 1 FROM tab_settlement_events child
        JOIN tabs parent ON parent.id = child.tab_id
        WHERE parent.business_id <> child.business_id
    ) THEN
        RAISE EXCEPTION 'Stage 3-4 tenant alignment validation failed';
    END IF;
END $$;

ALTER TABLE queue_entries ADD CONSTRAINT uq_queue_entries_id_business UNIQUE (id, business_id);
ALTER TABLE reservations ADD CONSTRAINT uq_reservations_id_business UNIQUE (id, business_id);
ALTER TABLE reservation_waitlist_entries ADD CONSTRAINT uq_waitlist_id_business UNIQUE (id, business_id);
ALTER TABLE service_types ADD CONSTRAINT uq_service_types_id_business UNIQUE (id, business_id);
ALTER TABLE customers ADD CONSTRAINT uq_customers_id_business UNIQUE (id, business_id);
ALTER TABLE preparation_stations ADD CONSTRAINT uq_preparation_stations_id_business UNIQUE (id, business_id);
ALTER TABLE menu_items ADD CONSTRAINT uq_menu_items_id_business UNIQUE (id, business_id);
ALTER TABLE item_library ADD CONSTRAINT uq_item_library_id_business UNIQUE (id, business_id);
ALTER TABLE orders ADD CONSTRAINT uq_orders_id_business UNIQUE (id, business_id);
ALTER TABLE order_line_items ADD CONSTRAINT uq_order_line_items_id_business UNIQUE (id, business_id);
ALTER TABLE tabs ADD CONSTRAINT uq_tabs_id_business UNIQUE (id, business_id);
ALTER TABLE tab_settlement_events ADD CONSTRAINT uq_tab_settlement_events_id_business UNIQUE (id, business_id);

ALTER TABLE queue_service_days
    ADD CONSTRAINT fk_queue_service_day_location_tenant
    FOREIGN KEY (location_id, business_id) REFERENCES locations(id, business_id) ON DELETE RESTRICT;
ALTER TABLE queue_entries
    ADD CONSTRAINT fk_queue_entry_location_tenant
    FOREIGN KEY (location_id, business_id) REFERENCES locations(id, business_id);
ALTER TABLE queue_entry_events
    ADD CONSTRAINT fk_queue_event_entry_tenant
    FOREIGN KEY (queue_entry_id, business_id) REFERENCES queue_entries(id, business_id) ON DELETE RESTRICT;

ALTER TABLE delivery_attempts
    ADD CONSTRAINT fk_delivery_reservation_tenant
        FOREIGN KEY (reservation_id, business_id) REFERENCES reservations(id, business_id),
    ADD CONSTRAINT fk_delivery_queue_tenant
        FOREIGN KEY (queue_entry_id, business_id) REFERENCES queue_entries(id, business_id),
    ADD CONSTRAINT fk_delivery_waitlist_tenant
        FOREIGN KEY (waitlist_entry_id, business_id) REFERENCES reservation_waitlist_entries(id, business_id);

ALTER TABLE reservation_waitlist_entries
    ADD CONSTRAINT fk_waitlist_service_type_tenant
        FOREIGN KEY (service_type_id, business_id) REFERENCES service_types(id, business_id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_waitlist_customer_tenant
        FOREIGN KEY (customer_id, business_id) REFERENCES customers(id, business_id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_waitlist_accepted_reservation_tenant
        FOREIGN KEY (accepted_reservation_id, business_id) REFERENCES reservations(id, business_id);

ALTER TABLE menu_items
    ADD CONSTRAINT fk_menu_item_station_tenant
    FOREIGN KEY (preparation_station_id, business_id) REFERENCES preparation_stations(id, business_id);
ALTER TABLE item_library
    ADD CONSTRAINT fk_library_item_station_tenant
    FOREIGN KEY (preparation_station_id, business_id) REFERENCES preparation_stations(id, business_id);
ALTER TABLE order_line_items
    ADD CONSTRAINT fk_order_line_order_tenant
        FOREIGN KEY (order_id, business_id) REFERENCES orders(id, business_id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_order_line_station_tenant
        FOREIGN KEY (preparation_station_id, business_id) REFERENCES preparation_stations(id, business_id);
ALTER TABLE order_status_timeline
    ADD CONSTRAINT fk_order_timeline_order_tenant
    FOREIGN KEY (order_id, business_id) REFERENCES orders(id, business_id) ON DELETE CASCADE;
ALTER TABLE order_line_status_timeline
    ADD CONSTRAINT fk_order_line_timeline_line_tenant
    FOREIGN KEY (order_line_item_id, business_id) REFERENCES order_line_items(id, business_id) ON DELETE RESTRICT;
ALTER TABLE order_revisions
    ADD CONSTRAINT fk_order_revision_order_tenant
    FOREIGN KEY (order_id, business_id) REFERENCES orders(id, business_id) ON DELETE RESTRICT;
ALTER TABLE menu_item_availability_events
    ADD CONSTRAINT fk_menu_availability_item_tenant
    FOREIGN KEY (menu_item_id, business_id) REFERENCES menu_items(id, business_id) ON DELETE RESTRICT;

ALTER TABLE tab_settlement_events
    ADD CONSTRAINT fk_tab_settlement_tab_tenant
        FOREIGN KEY (tab_id, business_id) REFERENCES tabs(id, business_id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_tab_settlement_related_tenant
        FOREIGN KEY (related_settlement_event_id, business_id)
        REFERENCES tab_settlement_events(id, business_id) ON DELETE RESTRICT;
ALTER TABLE tabs
    ADD CONSTRAINT fk_tabs_current_settlement_tenant
    FOREIGN KEY (current_settlement_event_id, business_id)
    REFERENCES tab_settlement_events(id, business_id) ON DELETE RESTRICT;

CREATE INDEX idx_order_line_items_tenant_order ON order_line_items(business_id, order_id);
CREATE INDEX idx_order_status_timeline_tenant_order ON order_status_timeline(business_id, order_id, changed_at);
