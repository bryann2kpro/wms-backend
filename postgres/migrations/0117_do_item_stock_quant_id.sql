ALTER TABLE main.delivery_order_items
  ADD COLUMN IF NOT EXISTS stock_quant_id uuid REFERENCES main.stock_quant(id) ON DELETE SET NULL;
