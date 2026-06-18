CREATE TABLE "main"."m_end_user" (
	"end_user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_name" text NOT NULL
);
