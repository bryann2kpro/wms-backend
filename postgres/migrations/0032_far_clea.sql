ALTER TABLE "main"."delivery_order_items" RENAME COLUMN "do_id" TO "purchase_order_no";--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" RENAME COLUMN "do_no" TO "delivery_order_no";--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" RENAME COLUMN "to_id" TO "purchase_order_no";--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" DROP CONSTRAINT "delivery_orders_do_no_unique";--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" DROP CONSTRAINT "delivery_orders_to_id_unique";--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ADD CONSTRAINT "delivery_orders_delivery_order_no_unique" UNIQUE("delivery_order_no");--> statement-breakpoint
ALTER TABLE "main"."delivery_orders" ADD CONSTRAINT "delivery_orders_purchase_order_no_unique" UNIQUE("purchase_order_no");