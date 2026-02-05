CREATE TABLE "main"."racks" (
	"rack_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rack_row" varchar NOT NULL,
	"rack_column" varchar NOT NULL,
	"rack_level" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
