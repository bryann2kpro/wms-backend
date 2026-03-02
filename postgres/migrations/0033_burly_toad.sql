CREATE TABLE "main"."inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku_id" uuid NOT NULL,
	"movement_type" text NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"balance_after" numeric(12, 2) NOT NULL,
	"reference_no" text,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."inventory_movements" ADD CONSTRAINT "inventory_movements_sku_id_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."skus"("sku_id") ON DELETE no action ON UPDATE no action;