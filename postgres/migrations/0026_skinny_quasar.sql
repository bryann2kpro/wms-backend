CREATE TABLE "main"."m_warehouses" (
	"warehouse_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_name" text NOT NULL,
	"warehouse_code" text,
	"warehouse_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "m_warehouses_warehouse_code_unique" UNIQUE("warehouse_code")
);
