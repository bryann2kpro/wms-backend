ALTER TABLE "main"."m_racks" ADD COLUMN "area_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."m_racks" ADD COLUMN "bin_type" text DEFAULT 'FIXED' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."m_racks" ADD COLUMN "bin_code" text;--> statement-breakpoint
ALTER TABLE "main"."m_racks" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."m_racks" ADD CONSTRAINT "m_racks_area_id_m_areas_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "main"."m_areas"("area_id") ON DELETE no action ON UPDATE no action;