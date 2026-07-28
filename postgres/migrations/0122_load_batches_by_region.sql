ALTER TABLE "main"."load_batches" DROP COLUMN "zone";
--> statement-breakpoint
ALTER TABLE "main"."load_batches" ADD COLUMN "region_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "main"."load_batches" ADD CONSTRAINT "load_batches_region_id_m_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "main"."m_regions"("region_id") ON DELETE no action ON UPDATE no action;
