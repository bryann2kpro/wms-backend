import { logger } from "@/util/logger";
import { invoicesRepository } from "@/composition-root";
import type { Job } from "bullmq";
import { registerCronJob } from "@/jobs/job-scheduler";

/**
 * System user id used for cron-created invoices.
 * This must be a valid UUID to satisfy the invoices.created_by / updated_by columns.
 * You can later map this to a dedicated "system" user record.
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

const INVOICES_CRON_PATTERN = "0 23 * * *";
const INVOICES_CRON_TIMEZONE = "Asia/Kuala_Lumpur";
const INVOICES_QUEUE_NAME = "invoices";
const INVOICES_JOB_NAME = "create-invoices";

export type RunInvoiceCreationJobResult = {
  eligibleCount: number;
  createdCount: number;
  errors: Array<{ doId: string; message: string }>;
};

/**
 * Runs the invoice creation job once: fetches eligible DOs and creates invoices.
 * Used by both the cron worker and the trigger API.
 */
export async function runInvoiceCreationJob(): Promise<RunInvoiceCreationJobResult> {
  const eligibleDos = await invoicesRepository.getDeliveryOrdersEligibleForInvoicing();
  const errors: Array<{ doId: string; message: string }> = [];
  let createdCount = 0;

  for (const doRow of eligibleDos) {
    try {
      await invoicesRepository.createInvoiceFromDeliveryOrder(doRow.id);
      createdCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Invoice already exists for this delivery order")) {
        logger.warn(`⚠️ [InvoicesCron] Invoice already exists for DO ${doRow.id}, skipping`);
        continue;
      }
      logger.error(`❌ [InvoicesCron] Failed to create invoice for DO ${doRow.id}:`, error);
      errors.push({ doId: doRow.id, message });
    }
  }

  return {
    eligibleCount: eligibleDos.length,
    createdCount,
    errors,
  };
}

export function startInvoicesCron(): void {
  registerCronJob({
    queueName: INVOICES_QUEUE_NAME,
    jobName: INVOICES_JOB_NAME,
    cron: INVOICES_CRON_PATTERN,
    timezone: INVOICES_CRON_TIMEZONE,
    enabledEnvKey: "INVOICES_CRON_ENABLED",
    handler: async (_job: Job) => {
      logger.info("ℹ️ [InvoicesCron] Running invoice creation job...");
      const result = await runInvoiceCreationJob();
      logger.info(
        `✅ [InvoicesCron] Invoice job completed. Eligible DOs: ${result.eligibleCount}, Invoices created: ${result.createdCount}`
      );
    },
  });
}

