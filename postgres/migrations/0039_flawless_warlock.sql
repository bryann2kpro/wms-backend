ALTER TABLE "main"."inventory_movements" ALTER COLUMN "balance_after" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "main"."inventory_movements" ALTER COLUMN "balance_after" DROP NOT NULL;