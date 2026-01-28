CREATE TABLE "main"."region_delivery_schedules" (
	"schedule_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"region_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"cutoff_days_before" smallint DEFAULT 1 NOT NULL,
	"cutoff_time" time DEFAULT '18:00:00' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "region_delivery_schedules_region_id_day_of_week_unique" UNIQUE("region_id","day_of_week")
);
--> statement-breakpoint
CREATE TABLE "main"."regions" (
	"region_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"region_name" text NOT NULL,
	"region_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "regions_region_code_unique" UNIQUE("region_code")
);
--> statement-breakpoint
ALTER TABLE "main"."outlets" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."outlets" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "main"."outlets" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."outlets" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "main"."outlets" ADD COLUMN "region_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."region_delivery_schedules" ADD CONSTRAINT "region_delivery_schedules_region_id_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "main"."regions"("region_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."outlets" ADD CONSTRAINT "outlets_region_id_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "main"."regions"("region_id") ON DELETE no action ON UPDATE no action;