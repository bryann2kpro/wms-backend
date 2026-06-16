import { logger } from "@/util/logger";
import { dailyOpeningStockRepository, organizationRepository } from "@/composition-root";
import type { Job } from "bullmq";
import { registerCronJob } from "@/jobs/job-scheduler";

/**
 * Cron pattern: midnight every day (Asia/Kuala_Lumpur).
 */
const DAILY_OPENING_STOCK_CRON_PATTERN = "0 0 * * *";
const DAILY_OPENING_STOCK_CRON_TIMEZONE = "Asia/Kuala_Lumpur";
const DAILY_OPENING_STOCK_QUEUE_NAME = "daily-opening-stock";
const DAILY_OPENING_STOCK_JOB_NAME = "snapshot-opening-stock";

export type RunDailyOpeningStockJobResult = {
  orgCount: number;
  errors: Array<{ orgId: string; message: string }>;
};

/**
 * Runs the daily opening stock snapshot once for all organizations.
 * Used by both the cron worker and any manual trigger.
 */
export async function runDailyOpeningStockJob(): Promise<RunDailyOpeningStockJobResult> {
  const orgIds = await organizationRepository.getAllOrganizationIds();
  const errors: Array<{ orgId: string; message: string }> = [];

  for (const orgId of orgIds) {
    try {
      await dailyOpeningStockRepository.snapshotToday(orgId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        `❌ [DailyOpeningStockCron] Failed to snapshot org ${orgId}:`,
        error
      );
      errors.push({ orgId, message });
    }
  }

  return { orgCount: orgIds.length, errors };
}

export function startDailyOpeningStockCron(): void {
  registerCronJob({
    queueName: DAILY_OPENING_STOCK_QUEUE_NAME,
    jobName: DAILY_OPENING_STOCK_JOB_NAME,
    cron: DAILY_OPENING_STOCK_CRON_PATTERN,
    timezone: DAILY_OPENING_STOCK_CRON_TIMEZONE,
    enabledEnvKey: "DAILY_OPENING_STOCK_CRON_ENABLED",
    handler: async (_job: Job) => {
      logger.info(
        "ℹ️ [DailyOpeningStockCron] Running daily opening stock snapshot..."
      );
      const result = await runDailyOpeningStockJob();
      logger.info(
        `✅ [DailyOpeningStockCron] Snapshot complete. Orgs: ${result.orgCount}, Errors: ${result.errors.length}`
      );
    },
  });
}
