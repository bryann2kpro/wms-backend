ALTER TABLE "main"."m_skus" ADD COLUMN IF NOT EXISTS "barcode" text;--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN IF NOT EXISTS "brand" text;--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN IF NOT EXISTS "category" text;--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN IF NOT EXISTS "manufacturer" text;--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN IF NOT EXISTS "case_rate" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN IF NOT EXISTS "case_ext_length_mm" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN IF NOT EXISTS "case_ext_width_mm" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN IF NOT EXISTS "case_ext_height_mm" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN IF NOT EXISTS "case_gross_weight_kg" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN IF NOT EXISTS "cases_per_layer" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN IF NOT EXISTS "no_of_layers" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "main"."m_skus" DROP COLUMN IF EXISTS "sku_price";--> statement-breakpoint
ALTER TABLE "main"."m_skus" DROP COLUMN IF EXISTS "carton_quantity";--> statement-breakpoint
ALTER TABLE "main"."m_skus" DROP COLUMN IF EXISTS "loss_quantity";