CREATE TYPE "main"."whatsapp_notification_status" AS ENUM('PENDING', 'RETRYING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TABLE "main"."whatsapp_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_type" text NOT NULL,
	"reference_id" uuid NOT NULL,
	"reference_label" text,
	"to_phone" text NOT NULL,
	"status" "main"."whatsapp_notification_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"error_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "main"."whatsapp_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"setting_key" text NOT NULL,
	"to_phones" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_settings_setting_key_unique" UNIQUE("setting_key")
);
