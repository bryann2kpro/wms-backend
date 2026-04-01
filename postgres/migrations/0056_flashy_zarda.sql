ALTER TABLE "main"."outlets" RENAME TO "m_outlet";--> statement-breakpoint
ALTER TABLE "main"."m_outlet" RENAME COLUMN "outlet_address" TO "address_snapshot";--> statement-breakpoint
ALTER TABLE "main"."m_outlet" DROP CONSTRAINT "outlets_organization_id_m_organizations_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."m_outlet" DROP CONSTRAINT "outlets_region_id_regions_region_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."m_outlet" ADD CONSTRAINT "m_outlet_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_outlet" ADD CONSTRAINT "m_outlet_region_id_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "main"."regions"("region_id") ON DELETE no action ON UPDATE no action;