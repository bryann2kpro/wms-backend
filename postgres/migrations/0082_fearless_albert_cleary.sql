CREATE TABLE "main"."stock_quant_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(12, 2) DEFAULT '0' NOT NULL,
	"source_rack_id" uuid NOT NULL,
	"destination_rack_id" uuid NOT NULL,
	"type" text,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "main"."stock_quant_transaction" ADD CONSTRAINT "stock_quant_transaction_sku_id_m_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."m_skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_quant_transaction" ADD CONSTRAINT "stock_quant_transaction_source_rack_id_m_racks_rack_id_fk" FOREIGN KEY ("source_rack_id") REFERENCES "main"."m_racks"("rack_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_quant_transaction" ADD CONSTRAINT "stock_quant_transaction_destination_rack_id_m_racks_rack_id_fk" FOREIGN KEY ("destination_rack_id") REFERENCES "main"."m_racks"("rack_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_quant_transaction" ADD CONSTRAINT "stock_quant_transaction_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;