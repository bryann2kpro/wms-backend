CREATE TABLE "main"."tms_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"distance_km" numeric(10, 2) NOT NULL,
	"estimated_duration_mins" numeric(10, 0) NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
