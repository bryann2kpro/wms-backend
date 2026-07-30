ALTER TABLE "main"."driver_otp_codes" ALTER COLUMN "driver_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."drivers" ALTER COLUMN "license_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."drivers" ALTER COLUMN "license_expiry" DROP NOT NULL;