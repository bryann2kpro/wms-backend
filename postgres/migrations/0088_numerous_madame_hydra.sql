ALTER TABLE "main"."m_areas" RENAME TO "m_warehouse_areas";--> statement-breakpoint
ALTER TABLE "main"."m_warehouse_areas" DROP CONSTRAINT "m_areas_organization_id_m_organizations_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."m_warehouse_areas" DROP CONSTRAINT "m_areas_map_id_m_maps_map_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."m_racks" DROP CONSTRAINT "m_racks_area_id_m_areas_area_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."m_warehouse_areas" ADD COLUMN "warehouse_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."m_pallet_labels" ADD COLUMN "bar_code" text;--> statement-breakpoint
ALTER TABLE "main"."m_pallet_labels" ADD COLUMN "reference_no" text;--> statement-breakpoint
ALTER TABLE "main"."m_pallet_labels" ADD COLUMN "printed_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."m_pallet_labels" ADD COLUMN "printed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."m_pallet_labels" ADD COLUMN "last_printed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."m_pick_face_strategies" ADD COLUMN "item_code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."m_racks" ADD COLUMN "bar_code" text;--> statement-breakpoint
ALTER TABLE "main"."m_warehouse_areas" ADD CONSTRAINT "m_warehouse_areas_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_warehouse_areas" ADD CONSTRAINT "m_warehouse_areas_warehouse_id_m_warehouses_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "main"."m_warehouses"("warehouse_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_warehouse_areas" ADD CONSTRAINT "m_warehouse_areas_map_id_m_maps_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "main"."m_maps"("map_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_racks" ADD CONSTRAINT "m_racks_area_id_m_warehouse_areas_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "main"."m_warehouse_areas"("area_id") ON DELETE no action ON UPDATE no action;