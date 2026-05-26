CREATE TABLE "main"."m_area" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."m_area" ADD CONSTRAINT "m_area_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;