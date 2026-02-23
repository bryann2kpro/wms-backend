ALTER TABLE "main"."outlets" ALTER COLUMN "outlet_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."audit_logs" ADD COLUMN "role" text;--> statement-breakpoint
CREATE INDEX "audit_role_idx" ON "main"."audit_logs" USING btree ("role");