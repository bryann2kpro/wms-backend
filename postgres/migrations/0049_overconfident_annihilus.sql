CREATE TABLE "main"."stock_count_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"sku_code" text NOT NULL,
	"sku_description" text NOT NULL,
	"opening_qty" numeric(12, 2) DEFAULT '0' NOT NULL,
	"opening_loss_qty" numeric(12, 2) DEFAULT '0' NOT NULL,
	"on_hand_qty" numeric(12, 2) DEFAULT '0' NOT NULL,
	"on_hand_loss_qty" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reserved_qty" numeric(12, 2) DEFAULT '0' NOT NULL,
	"qty_difference" numeric(12, 2) DEFAULT '0' NOT NULL,
	"loss_qty_difference" numeric(12, 2) DEFAULT '0' NOT NULL,
	"counted_qty" numeric(12, 2),
	"counted_loss_qty" numeric(12, 2),
	"action" text,
	"notes" text,
	"is_approved" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."stock_count_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"count_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "main"."stock_count_items" ADD CONSTRAINT "stock_count_items_session_id_stock_count_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "main"."stock_count_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_count_items" ADD CONSTRAINT "stock_count_items_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_count_items" ADD CONSTRAINT "stock_count_items_sku_id_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_count_sessions" ADD CONSTRAINT "stock_count_sessions_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;