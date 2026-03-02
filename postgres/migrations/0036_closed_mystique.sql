ALTER TABLE "main"."grn_items" RENAME COLUMN "warehouse_id" TO "rack_id";--> statement-breakpoint
ALTER TABLE "main"."grns" ADD COLUMN "warehouse_id" uuid;