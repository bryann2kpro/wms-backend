CREATE TABLE "main"."putaway" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"description" text,
	"source_rack_id" uuid NOT NULL,
	"destination_rack_id" uuid NOT NULL,
	"source_stock_quant_id" uuid NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "main"."putaway" ADD CONSTRAINT "putaway_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."putaway" ADD CONSTRAINT "putaway_sku_id_m_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."m_skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."putaway" ADD CONSTRAINT "putaway_source_rack_id_m_racks_rack_id_fk" FOREIGN KEY ("source_rack_id") REFERENCES "main"."m_racks"("rack_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."putaway" ADD CONSTRAINT "putaway_destination_rack_id_m_racks_rack_id_fk" FOREIGN KEY ("destination_rack_id") REFERENCES "main"."m_racks"("rack_id") ON DELETE no action ON UPDATE no action;