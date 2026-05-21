ALTER TABLE "main"."stock_quant_transaction" ADD COLUMN "expiry_date" timestamp;--> statement-breakpoint
ALTER TABLE "main"."stock_quant" ADD COLUMN "reserved_qty" numeric(12, 2) DEFAULT '0' NOT NULL;