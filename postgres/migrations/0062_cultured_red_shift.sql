ALTER TABLE "main"."region_pricing" RENAME TO "m_region_pricing";--> statement-breakpoint
ALTER TABLE "main"."m_region_pricing" DROP CONSTRAINT "region_pricing_region_id_m_regions_region_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."m_region_pricing" ADD CONSTRAINT "m_region_pricing_region_id_m_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "main"."m_regions"("region_id") ON DELETE cascade ON UPDATE no action;