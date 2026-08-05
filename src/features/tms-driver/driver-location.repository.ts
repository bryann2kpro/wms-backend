/**
 * Driver Location Repository
 *
 * @description Data access layer for driver GPS location history.
 */

import { db } from '@/db';
import { DriverLocationsTable, DriverLocationType } from './driver-location.model';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { logger } from '@/util/logger';

export class DriverLocationRepositoryClass {
  constructor() {}

  async recordLocation(driverId: string, lat: number, lng: number): Promise<DriverLocationType> {
    try {
      const [record] = await db
        .insert(DriverLocationsTable)
        .values({ driverId, lat: String(lat), lng: String(lng) })
        .returning();
      return record;
    } catch (error) {
      logger.error('❌ [DriverLocationRepository.recordLocation] Error:', error);
      throw error;
    }
  }

  /** Most recent ping for a driver, or null if none recorded yet. */
  async getLatestLocation(driverId: string): Promise<DriverLocationType | null> {
    const [record] = await db
      .select()
      .from(DriverLocationsTable)
      .where(eq(DriverLocationsTable.driverId, driverId))
      .orderBy(desc(DriverLocationsTable.capturedAt))
      .limit(1);
    return record ?? null;
  }

  /** Full trail for a driver, optionally bounded to a date range (inclusive), oldest first. */
  async getLocationHistory(driverId: string, from?: Date, to?: Date): Promise<DriverLocationType[]> {
    const conditions = [eq(DriverLocationsTable.driverId, driverId)];
    if (from) conditions.push(gte(DriverLocationsTable.capturedAt, from));
    if (to) conditions.push(lte(DriverLocationsTable.capturedAt, to));

    return db
      .select()
      .from(DriverLocationsTable)
      .where(and(...conditions))
      .orderBy(DriverLocationsTable.capturedAt);
  }
}
