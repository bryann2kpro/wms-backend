CREATE TABLE "main"."m_module" (
	"module_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_name" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(40) NOT NULL,
	"updated_by" varchar(40) NOT NULL,
	CONSTRAINT "m_module_module_name_unique" UNIQUE("module_name")
);
--> statement-breakpoint
CREATE TABLE "main"."m_permission" (
	"permission_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"permission_type" varchar(50) NOT NULL,
	"description" varchar(255),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(40) NOT NULL,
	"updated_by" varchar(40) NOT NULL,
	CONSTRAINT "m_permission_module_id_permission_type_unique" UNIQUE("module_id","permission_type")
);
--> statement-breakpoint
CREATE TABLE "main"."m_role" (
	"role_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_name" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(40) NOT NULL,
	"updated_by" varchar(40) NOT NULL,
	CONSTRAINT "m_role_role_name_unique" UNIQUE("role_name")
);
--> statement-breakpoint
CREATE TABLE "main"."role_permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(40) NOT NULL,
	"updated_by" varchar(40) NOT NULL,
	CONSTRAINT "role_permission_role_id_permission_id_unique" UNIQUE("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "main"."user_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(40) NOT NULL,
	"updated_by" varchar(40) NOT NULL,
	CONSTRAINT "user_role_user_id_role_id_unique" UNIQUE("user_id","role_id")
);
--> statement-breakpoint
DROP TABLE "main"."permission" CASCADE;--> statement-breakpoint
DROP TABLE "main"."role" CASCADE;--> statement-breakpoint
ALTER TABLE "main"."m_permission" ADD CONSTRAINT "m_permission_module_id_m_module_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "main"."m_module"("module_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."role_permission" ADD CONSTRAINT "role_permission_role_id_m_role_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "main"."m_role"("role_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."role_permission" ADD CONSTRAINT "role_permission_permission_id_m_permission_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "main"."m_permission"("permission_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."user_role" ADD CONSTRAINT "user_role_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "main"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."user_role" ADD CONSTRAINT "user_role_role_id_m_role_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "main"."m_role"("role_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."users" DROP COLUMN "role_id";