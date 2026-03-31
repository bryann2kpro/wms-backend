ALTER TABLE "main"."purchase_orders" ADD COLUMN "amount" numeric(12, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."purchase_orders" ADD COLUMN "amount_calc_snapshot" jsonb;