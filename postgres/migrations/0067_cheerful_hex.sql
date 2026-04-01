CREATE TYPE "main"."email_notification_status" AS ENUM('PENDING', 'RETRYING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TABLE "main"."email_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_type" text NOT NULL,
	"reference_id" uuid NOT NULL,
	"reference_label" text,
	"to_email" text NOT NULL,
	"status" "main"."email_notification_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"error_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
