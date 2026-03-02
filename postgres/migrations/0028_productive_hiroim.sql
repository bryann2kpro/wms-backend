ALTER TABLE "main"."grns" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "main"."grns" ADD COLUMN "proof_url" text;--> statement-breakpoint
ALTER TABLE "main"."skus" ADD COLUMN "loss_quantity" numeric(6, 2) NOT NULL DEFAULT '0';