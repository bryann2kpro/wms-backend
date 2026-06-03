CREATE TABLE "main"."m_pallet_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"storage_bin_id" uuid,
	"label_code" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."m_pick_face_strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"storage_bin_id" uuid NOT NULL,
	"bin_type" text DEFAULT 'FIXED_BIN' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."m_pickup_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"strategy" text DEFAULT 'FIFO' NOT NULL,
	"priority_override" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."m_transports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"storage_bin_id" uuid,
	"location" text,
	"min_length_mm" numeric(10, 2),
	"min_width_mm" numeric(10, 2),
	"min_height_mm" numeric(10, 2),
	"min_weight_kg" numeric(10, 3),
	"max_length_mm" numeric(10, 2),
	"max_width_mm" numeric(10, 2),
	"max_height_mm" numeric(10, 2),
	"max_weight_kg" numeric(10, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."m_racks" ADD COLUMN "area_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."m_racks" ADD COLUMN "bin_type" text DEFAULT 'FIXED' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."m_racks" ADD COLUMN "bin_code" text;--> statement-breakpoint
ALTER TABLE "main"."m_racks" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."m_pallet_labels" ADD CONSTRAINT "m_pallet_labels_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_pallet_labels" ADD CONSTRAINT "m_pallet_labels_storage_bin_id_m_racks_rack_id_fk" FOREIGN KEY ("storage_bin_id") REFERENCES "main"."m_racks"("rack_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_pick_face_strategies" ADD CONSTRAINT "m_pick_face_strategies_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_pick_face_strategies" ADD CONSTRAINT "m_pick_face_strategies_sku_id_m_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."m_skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_pick_face_strategies" ADD CONSTRAINT "m_pick_face_strategies_storage_bin_id_m_racks_rack_id_fk" FOREIGN KEY ("storage_bin_id") REFERENCES "main"."m_racks"("rack_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_pickup_criteria" ADD CONSTRAINT "m_pickup_criteria_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_pickup_criteria" ADD CONSTRAINT "m_pickup_criteria_sku_id_m_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."m_skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_transports" ADD CONSTRAINT "m_transports_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_transports" ADD CONSTRAINT "m_transports_storage_bin_id_m_racks_rack_id_fk" FOREIGN KEY ("storage_bin_id") REFERENCES "main"."m_racks"("rack_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_racks" ADD CONSTRAINT "m_racks_area_id_m_areas_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "main"."m_areas"("area_id") ON DELETE no action ON UPDATE no action;