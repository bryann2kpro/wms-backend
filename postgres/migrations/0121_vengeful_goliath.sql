CREATE TABLE "main"."geocode_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"label" text,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."load_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"zone" text NOT NULL,
	"driver_id" uuid,
	"status" text DEFAULT 'PENDING_DRIVER' NOT NULL,
	"assigned_at" timestamp with time zone,
	"leg_durations_seconds" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ADD COLUMN "load_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ADD COLUMN "load_order" integer;--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ADD COLUMN "loaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."load_batches" ADD CONSTRAINT "load_batches_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "main"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ADD CONSTRAINT "delivery_orders_load_batch_id_load_batches_id_fk" FOREIGN KEY ("load_batch_id") REFERENCES "main"."load_batches"("id") ON DELETE set null ON UPDATE no action;