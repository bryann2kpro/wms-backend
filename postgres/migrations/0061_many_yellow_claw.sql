ALTER TABLE "main"."regions" RENAME TO "m_regions";--> statement-breakpoint
ALTER TABLE "main"."m_regions" DROP CONSTRAINT "regions_region_code_unique";--> statement-breakpoint
ALTER TABLE "main"."inventory_movements" DROP CONSTRAINT "inventory_movements_region_id_regions_region_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."region_delivery_schedules" DROP CONSTRAINT "region_delivery_schedules_region_id_regions_region_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."m_outlet" DROP CONSTRAINT "m_outlet_region_id_regions_region_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."region_pricing" DROP CONSTRAINT "region_pricing_region_id_regions_region_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."inventory_movements" ADD CONSTRAINT "inventory_movements_region_id_m_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "main"."m_regions"("region_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."region_delivery_schedules" ADD CONSTRAINT "region_delivery_schedules_region_id_m_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "main"."m_regions"("region_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_outlet" ADD CONSTRAINT "m_outlet_region_id_m_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "main"."m_regions"("region_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."region_pricing" ADD CONSTRAINT "region_pricing_region_id_m_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "main"."m_regions"("region_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_regions" ADD CONSTRAINT "m_regions_region_code_unique" UNIQUE("region_code");