/**
 * Drivers Repository
 *
 * @description Data access layer for TMS driver roster operations.
 */

import { db } from '@/db';
import { DriversTable, DriverType, DriverInsertType } from './drivers.model';
import { eq, sql } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';

export class DriversRepositoryClass {
  constructor() {}

  /** Matches TMS's own `drivers(status: String): [Driver!]!` — flat list, no pagination. */
  async getDrivers(status?: string): Promise<DriverType[]> {
    try {
      logger.info('ℹ️ [DriversRepository.getDrivers] Getting drivers...');
      const data = status
        ? await db.select().from(DriversTable).where(eq(DriversTable.status, status)).orderBy(DriversTable.name)
        : await db.select().from(DriversTable).orderBy(DriversTable.name);
      logger.info('✅ [DriversRepository.getDrivers] Drivers fetched successfully');
      return data;
    } catch (error) {
      logger.error('❌ [DriversRepository.getDrivers] Error:', error);
      throw error;
    }
  }

  async getDriverById(id: string): Promise<DriverType | null> {
    const [record] = await db.select().from(DriversTable).where(eq(DriversTable.id, id)).limit(1);
    return record || null;
  }

  async getDriverByEmail(email: string): Promise<DriverType | null> {
    const [record] = await db.select().from(DriversTable).where(eq(DriversTable.email, email)).limit(1);
    return record || null;
  }

  /** Matches on digits-only comparison so "+60 14-558 3312" and "60145583312" both resolve to the same driver. */
  async getDriverByPhone(phone: string): Promise<DriverType | null> {
    const digitsOnly = phone.replace(/\D/g, '');
    const [record] = await db
      .select()
      .from(DriversTable)
      .where(sql`regexp_replace(${DriversTable.phone}, '[^0-9]', '', 'g') = ${digitsOnly}`)
      .limit(1);
    return record || null;
  }

  async createDriver(data: Omit<DriverInsertType, 'id' | 'createdAt' | 'updatedAt'>, tx?: DbTransaction): Promise<DriverType> {
    const dbClient = tx || db;
    const [record] = await dbClient.insert(DriversTable).values({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return record;
  }

  async updateDriver(id: string, data: Partial<DriverInsertType>, tx?: DbTransaction): Promise<DriverType | null> {
    const dbClient = tx || db;
    const [record] = await dbClient
      .update(DriversTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(DriversTable.id, id))
      .returning();
    return record || null;
  }

  async deleteDriver(id: string, tx?: DbTransaction): Promise<boolean> {
    const dbClient = tx || db;
    const result = await dbClient.delete(DriversTable).where(eq(DriversTable.id, id)).returning();
    return result.length > 0;
  }

  /** action is "IN" or "OUT" — matches TMS's own contract exactly. */
  async setDriverClock(id: string, action: 'IN' | 'OUT', tx?: DbTransaction): Promise<DriverType | null> {
    const dbClient = tx || db;
    const [record] = await dbClient
      .update(DriversTable)
      .set({ clockedInAt: action === 'IN' ? new Date() : null, updatedAt: new Date() })
      .where(eq(DriversTable.id, id))
      .returning();
    return record || null;
  }

  async setDriverPassword(id: string, passwordHash: string, tx?: DbTransaction): Promise<boolean> {
    const dbClient = tx || db;
    const result = await dbClient
      .update(DriversTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(DriversTable.id, id))
      .returning();
    return result.length > 0;
  }
}
