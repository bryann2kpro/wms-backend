import { env } from "@/env";
import Redis from "ioredis";
import type { Redis as RedisClient } from "ioredis";
import { logger } from "@/util/logger";

let sharedRedis: RedisClient | null = null;

export function getBullConnection(): RedisClient | null {
  if (sharedRedis) {
    return sharedRedis;
  }

  if (!env.REDIS_HOST || !env.REDIS_PORT) {
    logger.warn(
      "⚠️ [BullMQ] Redis is not configured (REDIS_HOST/REDIS_PORT). Job scheduler will not start."
    );
    return null;
  }

  sharedRedis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    db: env.REDIS_DB ?? 0,
    maxRetriesPerRequest: null,
  });

  return sharedRedis;
}

