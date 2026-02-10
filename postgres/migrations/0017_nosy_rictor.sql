DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'audit_action'
          AND n.nspname = 'main'
    ) THEN
        CREATE TYPE "main"."audit_action" AS ENUM('CREATE', 'UPDATE', 'DELETE');
    END IF;
END$$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."audit_logs" (
	"audit_log_id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"old_data" jsonb,
	"new_data" jsonb,
	"ip_address" "inet" NOT NULL,
	"user_agent" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."skus" RENAME COLUMN "sku_name" TO "sku_code";--> statement-breakpoint
ALTER TABLE "main"."skus" ALTER COLUMN "sku_price" SET DATA TYPE numeric(6, 2);--> statement-breakpoint
ALTER TABLE "main"."skus" ALTER COLUMN "sku_quantity" SET DATA TYPE numeric(6, 2);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_user_idx" ON "main"."audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_entity_idx" ON "main"."audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_created_idx" ON "main"."audit_logs" USING btree ("created_at");