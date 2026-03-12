CREATE TABLE "main"."m_organizations" (
	"organization_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_name" text NOT NULL,
	"organization_code" text NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "m_organizations_organization_code_unique" UNIQUE("organization_code")
);
--> statement-breakpoint
-- Insert default organization so ADD COLUMN ... NOT NULL DEFAULT can backfill existing rows
INSERT INTO "main"."m_organizations"
  ("organization_id", "organization_name", "organization_code", "status", "created_by", "updated_by")
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Default Organization', 'DEFAULT_ORG', 'active', 'system', 'system')
ON CONFLICT ("organization_code") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "main"."outlets" DROP CONSTRAINT "outlets_outlet_code_unique";--> statement-breakpoint
ALTER TABLE "main"."supplers" DROP CONSTRAINT "supplers_supplier_code_unique";--> statement-breakpoint
ALTER TABLE "main"."m_warehouses" DROP CONSTRAINT "m_warehouses_warehouse_code_unique";--> statement-breakpoint
ALTER TABLE "main"."m_role" DROP CONSTRAINT "m_role_role_name_unique";--> statement-breakpoint
ALTER TABLE "main"."users" ADD COLUMN "primary_organization_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."grns" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."supplier_deliveries" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."inventory_balances" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."invoices" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."region_delivery_schedules" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."outlets" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."racks" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."skus" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."supplers" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."m_warehouses" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."exceptions" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."purchase_orders" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."m_role" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."settlements" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;--> statement-breakpoint
ALTER TABLE "main"."users" ADD CONSTRAINT "users_primary_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("primary_organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."grns" ADD CONSTRAINT "grns_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."supplier_deliveries" ADD CONSTRAINT "supplier_deliveries_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."inventory_balances" ADD CONSTRAINT "inventory_balances_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."invoices" ADD CONSTRAINT "invoices_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."region_delivery_schedules" ADD CONSTRAINT "region_delivery_schedules_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."outlets" ADD CONSTRAINT "outlets_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."racks" ADD CONSTRAINT "racks_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."skus" ADD CONSTRAINT "skus_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."supplers" ADD CONSTRAINT "supplers_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_warehouses" ADD CONSTRAINT "m_warehouses_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ADD CONSTRAINT "delivery_orders_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."exceptions" ADD CONSTRAINT "exceptions_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_role" ADD CONSTRAINT "m_role_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."settlements" ADD CONSTRAINT "settlements_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_role" ADD CONSTRAINT "m_role_organization_id_role_name_unique" UNIQUE("organization_id","role_name");