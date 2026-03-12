-- Data Migration: Create default organization and assign existing data
-- This migration populates existing data with a default organization to enable multi-tenant support

-- Create default organization (if not exists)
INSERT INTO "main"."m_organizations"
  ("organization_id", "organization_name", "organization_code", "status", "created_by", "updated_by")
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Default Organization', 'DEFAULT_ORG', 'active', 'system', 'system')
ON CONFLICT ("organization_code") DO NOTHING;

--> statement-breakpoint

-- Assign all existing users to default organization
UPDATE "main"."users"
SET "primary_organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "primary_organization_id" IS NULL;

--> statement-breakpoint

-- Assign all roles to default organization
UPDATE "main"."m_role"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;

--> statement-breakpoint

-- Assign all master data to default organization
UPDATE "main"."m_warehouses"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;

--> statement-breakpoint

UPDATE "main"."outlets"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;

--> statement-breakpoint

UPDATE "main"."supplers"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;

--> statement-breakpoint

UPDATE "main"."skus"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;

--> statement-breakpoint

UPDATE "main"."racks"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;

--> statement-breakpoint

-- Assign all transactional data to default organization
UPDATE "main"."grns"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;

--> statement-breakpoint

UPDATE "main"."supplier_deliveries"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;

--> statement-breakpoint

UPDATE "main"."purchase_orders"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;

--> statement-breakpoint

UPDATE "main"."delivery_orders"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;

--> statement-breakpoint

UPDATE "main"."invoices"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;

--> statement-breakpoint

UPDATE "main"."inventory_balances"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;

--> statement-breakpoint

UPDATE "main"."settlements"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;

--> statement-breakpoint

UPDATE "main"."exceptions"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;

--> statement-breakpoint

UPDATE "main"."region_delivery_schedules"
SET "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "organization_id" IS NULL;
