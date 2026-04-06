CREATE TABLE "main"."stock_adjustment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_adjustment_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"movement_type" text NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."stock_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"adjustment_no" text NOT NULL,
	"reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "stock_adjustments_adjustment_no_unique" UNIQUE("adjustment_no")
);
--> statement-breakpoint
ALTER TABLE "main"."stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_stock_adjustment_id_stock_adjustments_id_fk" FOREIGN KEY ("stock_adjustment_id") REFERENCES "main"."stock_adjustments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_sku_id_m_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."m_skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_adjustments" ADD CONSTRAINT "stock_adjustments_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;