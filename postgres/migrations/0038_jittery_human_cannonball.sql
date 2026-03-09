-- delivery_orders: rename uuid column, add text column
ALTER TABLE "main"."delivery_orders" DROP CONSTRAINT "delivery_orders_purchase_order_no_unique";--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" RENAME COLUMN "purchase_order_no" TO "purchase_order_id";--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ADD COLUMN "purchase_order_no" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ADD CONSTRAINT "delivery_orders_purchase_order_id_unique" UNIQUE("purchase_order_id");--> statement-breakpoint

-- delivery_order_items: rename uuid column, add text column
ALTER TABLE "main"."delivery_order_items" RENAME COLUMN "purchase_order_no" TO "purchase_order_id";--> statement-breakpoint
ALTER TABLE "main"."delivery_order_items" ADD COLUMN "purchase_order_no" text NOT NULL DEFAULT '';
