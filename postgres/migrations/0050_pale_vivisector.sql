-- ALTER TABLE "main"."invoices" ADD COLUMN IF NOT EXISTS "do_no" text;

-- UPDATE "main"."invoices" AS i
-- SET "do_no" = d."delivery_order_no"
-- FROM "main"."delivery_orders" AS d
-- WHERE
--   d."purchase_order_id" = i."po_id"
--   AND d."organization_id" = i."organization_id"
--   AND (i."do_no" IS NULL OR i."do_no" = '');

-- -- Migration: Add stock count sessions and items tables
-- -- Purpose: Replace live stock count view with snapshot-based session model.
-- -- Each session captures a point-in-time inventory state; discrepancies are
-- -- reviewed and resolved within that session.

-- CREATE TABLE main.stock_count_sessions (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   organization_id UUID NOT NULL REFERENCES main.m_organizations(organization_id),
--   name TEXT NOT NULL,
--   status TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'closed'
--   count_date TIMESTAMPTZ NOT NULL DEFAULT now(),
--   created_by UUID NOT NULL,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--   closed_by UUID,
--   closed_at TIMESTAMPTZ
-- );

-- CREATE TABLE main.stock_count_items (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   session_id UUID NOT NULL REFERENCES main.stock_count_sessions(id) ON DELETE CASCADE,
--   organization_id UUID NOT NULL REFERENCES main.m_organizations(organization_id),
--   sku_id UUID NOT NULL REFERENCES main.skus(sku_id),

--   -- Denormalised snapshot values (captured at session creation time)
--   sku_code TEXT NOT NULL,
--   sku_description TEXT NOT NULL,
--   opening_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
--   opening_loss_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
--   on_hand_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
--   on_hand_loss_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
--   reserved_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
--   qty_difference NUMERIC(12, 2) NOT NULL DEFAULT 0,
--   loss_qty_difference NUMERIC(12, 2) NOT NULL DEFAULT 0,

--   -- User-editable resolution fields
--   counted_qty NUMERIC(12, 2),
--   counted_loss_qty NUMERIC(12, 2),
--   action TEXT,   -- 'tally_to_opening' | 'tally_to_stock_count' | 'manual_key_in'
--   notes TEXT,

--   -- Approval
--   is_approved BOOLEAN NOT NULL DEFAULT false,
--   approved_by UUID,
--   approved_at TIMESTAMPTZ,

--   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
-- );

-- CREATE INDEX idx_stock_count_sessions_org ON main.stock_count_sessions(organization_id);
-- CREATE INDEX idx_stock_count_items_session ON main.stock_count_items(session_id);
-- CREATE INDEX idx_stock_count_items_sku ON main.stock_count_items(sku_id);
