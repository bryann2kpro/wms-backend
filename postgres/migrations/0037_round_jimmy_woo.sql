ALTER TABLE "main"."inventory_transactions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "main"."inventory_transactions" CASCADE;--> statement-breakpoint
ALTER TABLE "main"."inventory_balances" ADD COLUMN "loss_qty" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."inventory_balances" ADD CONSTRAINT "inventory_balances_sku_id_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."skus"("sku_id") ON DELETE no action ON UPDATE no action;