CREATE TYPE "main"."stock_transfer_status" AS ENUM('IN_TRANSIT', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "main"."stock_transfer_type" AS ENUM('BIN_TO_BIN', 'WAREHOUSE_TO_WAREHOUSE');--> statement-breakpoint
CREATE TABLE "main"."stock_transfer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_transfer_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"lot_no" text,
	"expiry_date" timestamp with time zone,
	"quantity" numeric(12, 2) NOT NULL,
	"source_rack_id" uuid NOT NULL,
	"destination_rack_id" uuid NOT NULL,
	"source_stock_quant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."stock_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"transfer_no" text NOT NULL,
	"type" "main"."stock_transfer_type" NOT NULL,
	"status" "main"."stock_transfer_status" NOT NULL,
	"source_warehouse_id" uuid,
	"destination_warehouse_id" uuid,
	"remarks" text,
	"dispatched_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"received_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "stock_transfers_transfer_no_unique" UNIQUE("transfer_no")
);
--> statement-breakpoint
ALTER TABLE "main"."stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_stock_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("stock_transfer_id") REFERENCES "main"."stock_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_sku_id_m_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."m_skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_source_rack_id_m_racks_rack_id_fk" FOREIGN KEY ("source_rack_id") REFERENCES "main"."m_racks"("rack_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_destination_rack_id_m_racks_rack_id_fk" FOREIGN KEY ("destination_rack_id") REFERENCES "main"."m_racks"("rack_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_transfers" ADD CONSTRAINT "stock_transfers_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_transfers" ADD CONSTRAINT "stock_transfers_source_warehouse_id_m_warehouses_warehouse_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "main"."m_warehouses"("warehouse_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_transfers" ADD CONSTRAINT "stock_transfers_destination_warehouse_id_m_warehouses_warehouse_id_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "main"."m_warehouses"("warehouse_id") ON DELETE no action ON UPDATE no action;