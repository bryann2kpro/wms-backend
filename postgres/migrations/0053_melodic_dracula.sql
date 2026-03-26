ALTER TABLE "main"."es_advance_notices" ADD COLUMN "tranid" varchar(50);--> statement-breakpoint
UPDATE "main"."es_advance_notices" SET "tranid" = 'LEGACY-' || id::text WHERE "tranid" IS NULL;--> statement-breakpoint
ALTER TABLE "main"."es_advance_notices" ALTER COLUMN "tranid" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."es_advance_notices" ADD CONSTRAINT "es_advance_notices_tranid_unique" UNIQUE("tranid");