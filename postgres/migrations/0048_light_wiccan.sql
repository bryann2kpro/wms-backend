CREATE TABLE "main"."do_item_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"do_item_id" uuid NOT NULL,
	"grn_item_id" uuid NOT NULL,
	"rack_id" uuid,
	"qty_allocated" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."grn_items" ADD COLUMN "priority_flag" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."skus" ADD COLUMN "picking_strategy" text DEFAULT 'FIFO' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."do_item_allocations" ADD CONSTRAINT "do_item_allocations_do_item_id_delivery_order_items_id_fk" FOREIGN KEY ("do_item_id") REFERENCES "main"."delivery_order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."do_item_allocations" ADD CONSTRAINT "do_item_allocations_grn_item_id_grn_items_id_fk" FOREIGN KEY ("grn_item_id") REFERENCES "main"."grn_items"("id") ON DELETE cascade ON UPDATE no action;