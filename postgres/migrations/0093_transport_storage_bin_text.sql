ALTER TABLE "main"."m_transports" DROP CONSTRAINT "m_transports_storage_bin_id_m_racks_rack_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."m_transports" ALTER COLUMN "storage_bin_id" SET DATA TYPE text;