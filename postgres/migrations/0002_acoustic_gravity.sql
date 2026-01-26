CREATE TABLE "main"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(100) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"contact_no" varchar(20),
	"role_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "main"."company_admin" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "main"."role_permission" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "main"."super_admin" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "main"."user" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "main"."user_role" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "main"."company_admin" CASCADE;--> statement-breakpoint
DROP TABLE "main"."role_permission" CASCADE;--> statement-breakpoint
DROP TABLE "main"."super_admin" CASCADE;--> statement-breakpoint
DROP TABLE "main"."user" CASCADE;--> statement-breakpoint
DROP TABLE "main"."user_role" CASCADE;--> statement-breakpoint
ALTER TABLE "main"."permission" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."permission" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "main"."permission" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."permission" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "main"."role" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."role" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "main"."role" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."role" ALTER COLUMN "updated_at" SET DEFAULT now();