CREATE TABLE "main"."sku_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"min_expiry_month" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."m_outlet" ADD COLUMN "chain" text;--> statement-breakpoint
ALTER TABLE "main"."m_outlet" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "main"."m_outlet" ADD COLUMN "debtor" text;--> statement-breakpoint
ALTER TABLE "main"."m_pallet_labels" ADD COLUMN "item_code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."m_pallet_labels" ADD COLUMN "item_desc_02" text;--> statement-breakpoint
ALTER TABLE "main"."m_pallet_labels" ADD COLUMN "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."m_pallet_labels" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."m_pallet_labels" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."sku_assignments" ADD CONSTRAINT "sku_assignments_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."sku_assignments" ADD CONSTRAINT "sku_assignments_outlet_id_m_outlet_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."m_outlet"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."sku_assignments" ADD CONSTRAINT "sku_assignments_sku_id_m_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."m_skus"("sku_id") ON DELETE no action ON UPDATE no action;