ALTER TABLE "main"."running_no" RENAME COLUMN "partition_key" TO "prefix";--> statement-breakpoint
DROP INDEX "main"."running_no_scope_partition_key_uniq";--> statement-breakpoint
ALTER TABLE "main"."running_no" ADD COLUMN "date_key" text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE UNIQUE INDEX "running_no_scope_prefix_uniq" ON "main"."running_no" USING btree ("scope","prefix");