-- A transfer moves between two location-specific stock records. The original
-- Stage-5 session schema named only the source item, which cannot represent a
-- destination balance without corrupting location ownership.
ALTER TABLE inventory_transfer_lines
    ADD COLUMN destination_inventory_item_id UUID;

ALTER TABLE inventory_transfer_lines
    ADD CONSTRAINT fk_transfer_line_destination_item_tenant
    FOREIGN KEY (destination_inventory_item_id, business_id)
    REFERENCES inventory_items(id, business_id) ON DELETE RESTRICT;
