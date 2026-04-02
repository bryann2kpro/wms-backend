CREATE TABLE "main"."email_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"setting_key" text NOT NULL,
	"to_emails" text[] DEFAULT '{}' NOT NULL,
	"cc_emails" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_settings_setting_key_unique" UNIQUE("setting_key")
);
