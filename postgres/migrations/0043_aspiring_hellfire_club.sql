ALTER TABLE "main"."inventory_balances" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."inventory_balances" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "main"."inventory_movements" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."inventory_movements" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "main"."inventory_movements" ADD COLUMN "region_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."inventory_movements" ADD CONSTRAINT "inventory_movements_region_id_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "main"."regions"("region_id") ON DELETE no action ON UPDATE no action;