CREATE TYPE "main"."inventory_movement_type" AS ENUM ('INBOUND', 'RESERVED', 'SHIPMENT', 'ADJUSTMENT', 'DAMAGED');

ALTER TABLE "main"."inventory_balances" ALTER COLUMN "on_hand_qty" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "main"."inventory_balances" ALTER COLUMN "on_hand_qty" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "main"."inventory_balances" ALTER COLUMN "loss_qty" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "main"."inventory_balances" ALTER COLUMN "loss_qty" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "main"."inventory_balances" ALTER COLUMN "reserved_qty" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "main"."inventory_balances" ALTER COLUMN "reserved_qty" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "main"."inventory_movements" ALTER COLUMN "movement_type" TYPE "main"."inventory_movement_type" USING movement_type::"main"."inventory_movement_type";