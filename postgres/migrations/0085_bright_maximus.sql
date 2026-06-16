CREATE TYPE "public"."zone_purpose" AS ENUM('GENERAL', 'WET', 'DRY', 'AMBIENT', 'DAMAGED');--> statement-breakpoint
CREATE TABLE "main"."m_bins" (
	"bin_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rack_id" uuid NOT NULL,
	"bin_code" text NOT NULL,
	"level" text NOT NULL,
	"column" text NOT NULL,
	"capacity_volume" numeric(10, 3),
	"capacity_weight" numeric(10, 3),
	"current_volume" numeric(10, 3) DEFAULT '0' NOT NULL,
	"current_weight" numeric(10, 3) DEFAULT '0' NOT NULL,
	"is_pick_face" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."m_countries" (
	"country_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_name" text NOT NULL,
	"country_code" text NOT NULL,
	"currency" text,
	"locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "m_countries_country_code_unique" UNIQUE("country_code")
);
--> statement-breakpoint
INSERT INTO "main"."m_countries"
  ("country_id", "country_name", "country_code", "currency", "locale", "created_by", "updated_by")
VALUES
  ('00000000-0000-0000-0000-000000000002'::uuid, 'Malaysia', 'MY', 'MYR', 'en-MY', 'system', 'system')
ON CONFLICT ("country_code") DO NOTHING;
--> statement-breakpoint
CREATE TABLE "main"."m_putaway_rules" (
	"putaway_rule_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"item_attribute_key" text NOT NULL,
	"item_attribute_value" text NOT NULL,
	"target_zone_purpose" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."warehouse_principals" (
	"warehouse_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."m_zones" (
	"zone_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"zone_code" text NOT NULL,
	"zone_name" text NOT NULL,
	"purpose" "zone_purpose" DEFAULT 'GENERAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."stock_quant_transaction" ALTER COLUMN "created_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "main"."stock_quant_transaction" ALTER COLUMN "updated_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "main"."stock_quant" ALTER COLUMN "created_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "main"."stock_quant" ALTER COLUMN "updated_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "main"."audit_logs" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."audit_logs" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."m_organizations" ADD COLUMN "country_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."m_organizations" ADD COLUMN "region_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."m_racks" ADD COLUMN "zone_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."m_regions" ADD COLUMN "country_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000002'::uuid;--> statement-breakpoint
ALTER TABLE "main"."m_regions" ALTER COLUMN "country_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "main"."m_warehouses" ADD COLUMN "region_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."stock_quant_transaction" ADD COLUMN "lot_no" text;--> statement-breakpoint
ALTER TABLE "main"."stock_quant" ADD COLUMN "lot_no" text;--> statement-breakpoint
ALTER TABLE "main"."stock_quant" ADD COLUMN "expiry_date" timestamp;--> statement-breakpoint
ALTER TABLE "main"."m_bins" ADD CONSTRAINT "m_bins_rack_id_m_racks_rack_id_fk" FOREIGN KEY ("rack_id") REFERENCES "main"."m_racks"("rack_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_putaway_rules" ADD CONSTRAINT "m_putaway_rules_warehouse_id_m_warehouses_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "main"."m_warehouses"("warehouse_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."warehouse_principals" ADD CONSTRAINT "warehouse_principals_warehouse_id_m_warehouses_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "main"."m_warehouses"("warehouse_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."warehouse_principals" ADD CONSTRAINT "warehouse_principals_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_zones" ADD CONSTRAINT "m_zones_warehouse_id_m_warehouses_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "main"."m_warehouses"("warehouse_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_organizations" ADD CONSTRAINT "m_organizations_country_id_m_countries_country_id_fk" FOREIGN KEY ("country_id") REFERENCES "main"."m_countries"("country_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_organizations" ADD CONSTRAINT "m_organizations_region_id_m_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "main"."m_regions"("region_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_racks" ADD CONSTRAINT "m_racks_zone_id_m_zones_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "main"."m_zones"("zone_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_regions" ADD CONSTRAINT "m_regions_country_id_m_countries_country_id_fk" FOREIGN KEY ("country_id") REFERENCES "main"."m_countries"("country_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_warehouses" ADD CONSTRAINT "m_warehouses_region_id_m_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "main"."m_regions"("region_id") ON DELETE no action ON UPDATE no action;