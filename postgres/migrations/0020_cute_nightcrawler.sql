ALTER TYPE "main"."audit_action" ADD VALUE 'BULK_CREATE';--> statement-breakpoint
ALTER TYPE "main"."audit_action" ADD VALUE 'BULK_UPDATE';--> statement-breakpoint
ALTER TYPE "main"."audit_action" ADD VALUE 'BULK_DELETE';--> statement-breakpoint
ALTER TYPE "main"."audit_action" ADD VALUE 'CREATE_FAILED';--> statement-breakpoint
ALTER TYPE "main"."audit_action" ADD VALUE 'UPDATE_FAILED';--> statement-breakpoint
ALTER TYPE "main"."audit_action" ADD VALUE 'DELETE_FAILED';--> statement-breakpoint
ALTER TYPE "main"."audit_action" ADD VALUE 'BULK_CREATE_FAILED';--> statement-breakpoint
ALTER TYPE "main"."audit_action" ADD VALUE 'BULK_UPDATE_FAILED';--> statement-breakpoint
ALTER TYPE "main"."audit_action" ADD VALUE 'BULK_DELETE_FAILED';--> statement-breakpoint
ALTER TABLE "main"."audit_logs" ALTER COLUMN "batch_id" DROP DEFAULT;