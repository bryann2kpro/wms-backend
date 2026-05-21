ALTER TABLE "main"."m_skus" ADD COLUMN "is_lot_controlled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD COLUMN "is_expiry_controlled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."putaway" ADD COLUMN IF NOT EXISTS "lot_no" text;