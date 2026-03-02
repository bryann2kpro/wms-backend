CREATE TABLE "main"."purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_no" text NOT NULL,
	"sku_code" text NOT NULL,
	"qty_required" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "main"."purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_no" text NOT NULL,
	"outlet_id" uuid NOT NULL,
	"scheduled_delivery_date" timestamp with time zone,
	"status" text DEFAULT 'NEW' NOT NULL,
	"raw_payload" jsonb,
	"pulled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "purchase_orders_purchase_order_no_unique" UNIQUE("purchase_order_no")
);
--> statement-breakpoint
ALTER TABLE "main"."transfer_order_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "main"."transfer_orders" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "main"."transfer_order_items" CASCADE;--> statement-breakpoint
DROP TABLE "main"."transfer_orders" CASCADE;--> statement-breakpoint
ALTER TABLE "main"."delivery_order_items" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."delivery_order_items" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "main"."delivery_order_items" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."delivery_order_items" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "main"."delivery_order_items" ALTER COLUMN "created_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "main"."delivery_order_items" ALTER COLUMN "updated_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ALTER COLUMN "created_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ALTER COLUMN "updated_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "main"."exceptions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."exceptions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "main"."exceptions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."exceptions" ALTER COLUMN "updated_at" SET DEFAULT now();