ALTER TABLE "main"."m_skus" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN "manufacturer" text;--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN "case_rate" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN "case_ext_length_mm" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN "case_ext_width_mm" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN "case_ext_height_mm" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN "case_gross_weight_kg" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN "cases_per_layer" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN "no_of_layers" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "main"."m_skus" DROP COLUMN "sku_price";--> statement-breakpoint
ALTER TABLE "main"."m_skus" DROP COLUMN "carton_quantity";--> statement-breakpoint
ALTER TABLE "main"."m_skus" DROP COLUMN "loss_quantity";