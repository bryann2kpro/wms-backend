CREATE TABLE "main"."region_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"region_id" uuid NOT NULL,
	"rate" numeric(12, 2) NOT NULL,
	"min_qty" numeric(10, 2) DEFAULT '5' NOT NULL,
	"sst_rate" numeric(5, 4) DEFAULT '0.0600' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."region_pricing" ADD CONSTRAINT "region_pricing_region_id_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "main"."regions"("region_id") ON DELETE cascade ON UPDATE no action;