CREATE TABLE "main"."m_picking_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"chain" text DEFAULT '' NOT NULL,
	"channel" text DEFAULT '' NOT NULL,
	"debtor" text DEFAULT '' NOT NULL,
	"delivery_point" text DEFAULT '' NOT NULL,
	"storage_class" text DEFAULT '' NOT NULL,
	"brand" text DEFAULT '' NOT NULL,
	"item_category" text DEFAULT '' NOT NULL,
	"manufacturer" text DEFAULT '' NOT NULL,
	"item" text DEFAULT '' NOT NULL,
	"min_expiry_month" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."m_picking_criteria" ADD CONSTRAINT "m_picking_criteria_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;