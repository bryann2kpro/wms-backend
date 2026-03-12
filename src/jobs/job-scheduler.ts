import { Queue, Worker, type Job } from "bullmq";
import { getBullConnection } from "./bullmq-connection";
import { logger } from "@/util/logger";

type RegisterCronJobOptions = {
  queueName: string;
  jobName: string;
  cron: string;
  timezone: string;
  enabledEnvKey?: string;
  handler: (job: Job) => Promise<void> | void;
};

export function registerCronJob(options: RegisterCronJobOptions): void {
  const { queueName, jobName, cron, timezone, enabledEnvKey, handler } = options;

  if (enabledEnvKey) {
    const flag = process.env[enabledEnvKey] ?? "true";
    const enabled = flag.toLowerCase() === "true";
    if (!enabled) {
      logger.info(
        `ℹ️ [JobScheduler] Cron job "${jobName}" on queue "${queueName}" disabled (${enabledEnvKey} != true)`
      );
      return;
    }
  }

  const connection = getBullConnection();
  if (!connection) {
    // getBullConnection already logged a warning
    return;
  }

  const queue = new Queue(queueName, { connection });

  const worker = new Worker(
    queueName,
    async (job: Job) => {
      if (job.name !== jobName) return;
      await handler(job);
    },
    { connection }
  );

  worker.on("failed", (job: Job | undefined, err: Error) => {
    logger.error(
      `❌ [JobScheduler] Job "${jobName}" failed (id=${job?.id ?? "unknown"}):`,
      err
    );
  });

  logger.info(
    `⏰ [JobScheduler] Scheduling cron job "${jobName}" on queue "${queueName}" with pattern "${cron}" tz="${timezone}"`
  );

  void queue.add(
    jobName,
    { triggeredBy: "schedule" },
    {
      repeat: {
        pattern: cron,
        tz: timezone,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    }
  );
}

