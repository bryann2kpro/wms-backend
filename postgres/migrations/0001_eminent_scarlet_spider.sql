CREATE TABLE "main"."address_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"attn_name" text,
	"tel" text,
	"fax" text,
	"address_text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_type" text NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"mime_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"url" text,
	"checksum" text,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."grn_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grn_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"qty" numeric(10, 2) NOT NULL,
	"remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "main"."grns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grn_no" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_delivery_id" uuid,
	"po_no" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"received_at" timestamp,
	"approved_by" uuid,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "grns_grn_no_unique" UNIQUE("grn_no")
);
--> statement-breakpoint
CREATE TABLE "main"."supplier_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_delivery_no" text NOT NULL,
	"delivery_date" timestamp NOT NULL,
	"transporter" text,
	"lorry_plate" text,
	"invoice_to_address_id" uuid,
	"deliver_to_address_id" uuid,
	"account" text,
	"po_no" text,
	"jt_no" text,
	"order_date" timestamp,
	"status" text DEFAULT 'RECEIVED_DRAFT' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "supplier_deliveries_supplier_delivery_no_unique" UNIQUE("supplier_delivery_no")
);
--> statement-breakpoint
CREATE TABLE "main"."supplier_delivery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_delivery_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"item_id" text,
	"item_name" text,
	"qty_delivered" numeric(10, 2) NOT NULL,
	"qty_ordered" numeric(10, 2),
	"qty_to_follow" numeric(10, 2),
	"remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "main"."integration_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp,
	"payload" jsonb,
	"result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."sync_cursors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"last_success_at" timestamp,
	"last_cursor_value" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sync_cursors_source_unique" UNIQUE("source")
);
--> statement-breakpoint
CREATE TABLE "main"."inventory_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku_id" uuid NOT NULL,
	"on_hand_qty" numeric(10, 2) DEFAULT '0' NOT NULL,
	"reserved_qty" numeric(10, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_balances_sku_id_unique" UNIQUE("sku_id")
);
--> statement-breakpoint
CREATE TABLE "main"."inventory_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"txn_type" text NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"qty" numeric(10, 2) NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."invoice_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"format" text NOT NULL,
	"storage_key" text NOT NULL,
	"url" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"item_no" text,
	"sku_id" uuid NOT NULL,
	"description" text,
	"qty" numeric(10, 2) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"sub_total" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "main"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_no" text NOT NULL,
	"do_id" uuid NOT NULL,
	"to_id" uuid,
	"po_no" text,
	"billing_address_id" uuid,
	"delivery_address_id" uuid,
	"customer_account" text,
	"sales_executive" text,
	"page_no" text,
	"date_issued" timestamp,
	"total_excl_tax" numeric(12, 2),
	"tax_amount" numeric(12, 2),
	"total_incl_tax" numeric(12, 2),
	"tax_rate" numeric(5, 2),
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"issued_by" uuid,
	"issued_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "invoices_invoice_no_unique" UNIQUE("invoice_no"),
	CONSTRAINT "invoices_do_id_unique" UNIQUE("do_id")
);
--> statement-breakpoint
CREATE TABLE "main"."outlets" (
	"outlet_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_name" text NOT NULL,
	"outlet_code" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "outlets_outlet_code_unique" UNIQUE("outlet_code")
);
--> statement-breakpoint
CREATE TABLE "main"."skus" (
	"sku_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku_name" text NOT NULL,
	"sku_description" text NOT NULL,
	"sku_price" numeric NOT NULL,
	"sku_quantity" numeric(2) NOT NULL,
	"sku_unit_of_measurement" text NOT NULL,
	"is_active" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."supplers" (
	"supplier_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_name" text NOT NULL,
	"supplier_code" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "supplers_supplier_code_unique" UNIQUE("supplier_code")
);
--> statement-breakpoint
CREATE TABLE "main"."delivery_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"do_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"qty_required" numeric(10, 2) NOT NULL,
	"qty_picked" numeric(10, 2) DEFAULT '0',
	"qty_packed" numeric(10, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "main"."delivery_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"do_no" text NOT NULL,
	"to_id" uuid NOT NULL,
	"status" text DEFAULT 'CREATED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "delivery_orders_do_no_unique" UNIQUE("do_no"),
	CONSTRAINT "delivery_orders_to_id_unique" UNIQUE("to_id")
);
--> statement-breakpoint
CREATE TABLE "main"."exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"do_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"type" text NOT NULL,
	"qty" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'REPORTED' NOT NULL,
	"reported_by" uuid NOT NULL,
	"reported_at" timestamp DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp,
	"decision_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."transfer_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"qty" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "main"."transfer_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"netsuite_to_id" text NOT NULL,
	"to_no" text NOT NULL,
	"outlet_id" uuid NOT NULL,
	"requested_delivery_date" timestamp,
	"scheduled_delivery_date" timestamp,
	"status" text DEFAULT 'NEW' NOT NULL,
	"raw_payload" jsonb,
	"pulled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "transfer_orders_netsuite_to_id_unique" UNIQUE("netsuite_to_id"),
	CONSTRAINT "transfer_orders_to_no_unique" UNIQUE("to_no")
);
--> statement-breakpoint
CREATE TABLE "main"."settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"do_id" uuid NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"delivered_confirmed" boolean DEFAULT false NOT NULL,
	"signed_proof_uploaded" boolean DEFAULT false NOT NULL,
	"exceptions_resolved" boolean DEFAULT false NOT NULL,
	"netsuite_updated" boolean DEFAULT false NOT NULL,
	"invoice_issued" boolean DEFAULT false NOT NULL,
	"settled_by" uuid,
	"settled_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "settlements_do_id_unique" UNIQUE("do_id")
);
