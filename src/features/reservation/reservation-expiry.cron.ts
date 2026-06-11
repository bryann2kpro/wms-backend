import { logger } from "@/util/logger";
import type { Job } from "bullmq";
import { registerCronJob } from "@/jobs/job-scheduler";
import { ReservationService } from "./reservation.service";
import type { ExpireReservationsResult } from "./reservation.service";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

const RESERVATION_EXPIRY_CRON_PATTERN = "*/15 * * * *";
const RESERVATION_EXPIRY_CRON_TIMEZONE = "Asia/Kuala_Lumpur";
const RESERVATION_EXPIRY_QUEUE_NAME = "reservation-expiry";
const RESERVATION_EXPIRY_JOB_NAME = "expire-reservations";

const service = new ReservationService();

export async function runReservationExpiryJob(
  asOf: Date = new Date(),
): Promise<ExpireReservationsResult> {
  return service.expireReservations(asOf, undefined, SYSTEM_USER_ID);
}

export function startReservationExpiryCron(): void {
  registerCronJob({
    queueName: RESERVATION_EXPIRY_QUEUE_NAME,
    jobName: RESERVATION_EXPIRY_JOB_NAME,
    cron: RESERVATION_EXPIRY_CRON_PATTERN,
    timezone: RESERVATION_EXPIRY_CRON_TIMEZONE,
    enabledEnvKey: "RESERVATION_EXPIRY_CRON_ENABLED",
    handler: async (_job: Job) => {
      logger.info("ℹ️ [ReservationExpiryCron] Running reservation expiry job...");
      const result = await runReservationExpiryJob();
      logger.info(
        `✅ [ReservationExpiryCron] Scanned ${result.scannedCount}, expired ${result.expiredCount}, errors ${result.errors.length}`,
      );
    },
  });
}
