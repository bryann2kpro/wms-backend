ALTER TABLE "main"."racks" RENAME TO "m_racks";--> statement-breakpoint
ALTER TABLE "main"."skus" RENAME TO "m_skus";--> statement-breakpoint
ALTER TABLE "main"."stock_units" RENAME TO "m_stock_units";--> statement-breakpoint
ALTER TABLE "main"."supplers" RENAME TO "m_suppliers";--> statement-breakpoint
ALTER TABLE "main"."m_stock_units" DROP CONSTRAINT "stock_units_unit_code_unique";--> statement-breakpoint
ALTER TABLE "main"."inventory_balances" DROP CONSTRAINT "inventory_balances_sku_id_skus_sku_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."inventory_movements" DROP CONSTRAINT "inventory_movements_sku_id_skus_sku_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."stock_count_items" DROP CONSTRAINT "stock_count_items_sku_id_skus_sku_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."m_racks" DROP CONSTRAINT "racks_organization_id_m_organizations_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."m_skus" DROP CONSTRAINT "skus_organization_id_m_organizations_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."m_skus" DROP CONSTRAINT "skus_sku_unit_of_measurement_stock_units_stock_unit_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."m_suppliers" DROP CONSTRAINT "supplers_organization_id_m_organizations_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."inventory_balances" ADD CONSTRAINT "inventory_balances_sku_id_m_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."m_skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."inventory_movements" ADD CONSTRAINT "inventory_movements_sku_id_m_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."m_skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."stock_count_items" ADD CONSTRAINT "stock_count_items_sku_id_m_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "main"."m_skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_racks" ADD CONSTRAINT "m_racks_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD CONSTRAINT "m_skus_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_skus" ADD CONSTRAINT "m_skus_sku_unit_of_measurement_m_stock_units_stock_unit_id_fk" FOREIGN KEY ("sku_unit_of_measurement") REFERENCES "main"."m_stock_units"("stock_unit_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_suppliers" ADD CONSTRAINT "m_suppliers_organization_id_m_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "main"."m_organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."m_stock_units" ADD CONSTRAINT "m_stock_units_unit_code_unique" UNIQUE("unit_code");