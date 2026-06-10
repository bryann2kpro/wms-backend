CREATE TABLE "main"."customer_priority" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_code" text NOT NULL,
	"customer_name" text,
	"rank" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "main"."stock_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reservation_no" text NOT NULL,
	"customer_code" text NOT NULL,
	"sku_id" uuid NOT NULL,
	"grn_item_id" uuid,
	"inventory_balance_id" uuid NOT NULL,
	"qty_reserved" numeric(12, 2) NOT NULL,
	"qty_consumed" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reserve_start" timestamp with time zone NOT NULL,
	"reserve_end" timestamp with time zone NOT NULL,
	"priority_flag" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"source_type" text,
	"source_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text,
	CONSTRAINT "stock_reservations_reservation_no_unique" UNIQUE("reservation_no")
);
--> statement-breakpoint
ALTER TABLE "main"."customer_priority" ADD CONSTRAINT "customer_priority_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_reservations" ADD CONSTRAINT "stock_reservations_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_reservations" ADD CONSTRAINT "stock_reservations_sku_id_m_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."m_skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_reservations" ADD CONSTRAINT "stock_reservations_grn_item_id_grn_items_id_fk" FOREIGN KEY ("grn_item_id") REFERENCES "main"."grn_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_reservations" ADD CONSTRAINT "stock_reservations_inventory_balance_id_inventory_balances_id_fk" FOREIGN KEY ("inventory_balance_id") REFERENCES "main"."inventory_balances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_priority_org_customer_uniq" ON "main"."customer_priority" USING btree ("organization_id","customer_code");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_priority_org_rank_uniq" ON "main"."customer_priority" USING btree ("organization_id","rank");--> statement-breakpoint
CREATE INDEX "stock_reservations_sku_status_window_idx" ON "main"."stock_reservations" USING btree ("sku_id","status","reserve_start","reserve_end");--> statement-breakpoint
CREATE INDEX "stock_reservations_customer_status_idx" ON "main"."stock_reservations" USING btree ("organization_id","customer_code","status");--> statement-breakpoint
CREATE INDEX "stock_reservations_grn_item_idx" ON "main"."stock_reservations" USING btree ("grn_item_id");