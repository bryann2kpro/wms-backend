CREATE TABLE "main"."grn_item_loss_racks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grn_item_id" uuid NOT NULL,
	"rack_id" uuid NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '0' NOT NULL
);
