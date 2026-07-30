CREATE TABLE "main"."driver_otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."driver_otp_codes" ADD CONSTRAINT "driver_otp_codes_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "main"."drivers"("id") ON DELETE cascade ON UPDATE no action;