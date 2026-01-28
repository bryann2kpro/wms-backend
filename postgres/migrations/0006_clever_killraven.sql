CREATE TABLE "main"."stock_units" (
	"stock_unit_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_name" text NOT NULL,
	"unit_code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "stock_units_unit_code_unique" UNIQUE("unit_code")
);
--> statement-breakpoint
ALTER TABLE "main"."outlets" ADD COLUMN "outlet_address" text NOT NULL;