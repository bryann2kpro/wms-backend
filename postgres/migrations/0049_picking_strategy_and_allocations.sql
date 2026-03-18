-- Migration: Picking Strategy, GRN Priority Flag, and DO Item Allocations
-- Adds support for FIFO/LIFO/FEFO picking strategies per SKU,
-- priority flags on GRN batches, and a pick list allocation table.

-- 1. Add picking_strategy to skus table
ALTER TABLE ederan_main.skus
  ADD COLUMN IF NOT EXISTS picking_strategy TEXT NOT NULL DEFAULT 'FIFO';

-- 2. Add priority_flag to grn_items table
ALTER TABLE ederan_main.grn_items
  ADD COLUMN IF NOT EXISTS priority_flag BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Create do_item_allocations table
CREATE TABLE IF NOT EXISTS ederan_main.do_item_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  do_item_id UUID NOT NULL REFERENCES ederan_main.delivery_order_items(id) ON DELETE CASCADE,
  grn_item_id UUID NOT NULL REFERENCES ederan_main.grn_items(id) ON DELETE CASCADE,
  rack_id UUID REFERENCES ederan_main.racks(id) ON DELETE SET NULL,
  qty_allocated NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_do_item_allocations_do_item_id ON ederan_main.do_item_allocations(do_item_id);
CREATE INDEX IF NOT EXISTS idx_do_item_allocations_grn_item_id ON ederan_main.do_item_allocations(grn_item_id);
