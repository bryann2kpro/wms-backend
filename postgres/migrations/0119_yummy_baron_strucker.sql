CREATE TABLE "main"."tms_pod_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"do_id" uuid NOT NULL,
	"do_no" text NOT NULL,
	"outlet_name" text NOT NULL,
	"driver_id" uuid,
	"photo_url" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."tms_pod_records" ADD CONSTRAINT "tms_pod_records_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "main"."drivers"("id") ON DELETE set null ON UPDATE no action;