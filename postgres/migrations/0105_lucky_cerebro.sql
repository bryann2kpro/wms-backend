CREATE TABLE "main"."return_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"do_item_id" uuid,
	"sku_id" uuid NOT NULL,
	"lot_no" text,
	"expiry_date" timestamp with time zone,
	"qty_returned" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"condition_notes" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"qty_putaway" numeric(12, 2) DEFAULT '0' NOT NULL,
	"assigned_rack_id" uuid,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "main"."returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"return_no" text NOT NULL,
	"do_id" uuid NOT NULL,
	"delivery_order_no" text NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"purchase_order_no" text NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"received_by" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "returns_return_no_unique" UNIQUE("return_no"),
	CONSTRAINT "returns_do_id_unique" UNIQUE("do_id")
);
--> statement-breakpoint
ALTER TABLE "main"."return_items" ADD CONSTRAINT "return_items_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "main"."returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."return_items" ADD CONSTRAINT "return_items_sku_id_m_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."m_skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."return_items" ADD CONSTRAINT "return_items_assigned_rack_id_m_racks_rack_id_fk" FOREIGN KEY ("assigned_rack_id") REFERENCES "main"."m_racks"("rack_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."returns" ADD CONSTRAINT "returns_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;