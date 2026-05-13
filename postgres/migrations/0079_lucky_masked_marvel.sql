CREATE TABLE "main"."daily_opening_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"record_date" date NOT NULL,
	"sku_id" uuid NOT NULL,
	"opening_qty" numeric(12, 2) DEFAULT '0' NOT NULL,
	"opening_loss_qty" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."daily_opening_stock" ADD CONSTRAINT "daily_opening_stock_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."daily_opening_stock" ADD CONSTRAINT "daily_opening_stock_sku_id_m_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."m_skus"("sku_id") ON DELETE no action ON UPDATE no action;