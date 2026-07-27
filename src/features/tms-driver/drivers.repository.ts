/**
 * Drivers Repository
 *
 * @description Data access layer for TMS driver roster operations.
 */

import { db } from '@/db';
import { DriversTable, DriverType, DriverInsertType } from './drivers.model';
import { eq, and, like } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

export type DriverFilter = {
  id?: string;
  name?: string;
  status?: string;
};

export class DriversRepositoryClass {
  constructor() {}

  async getDrivers(filter: DriverFilter, paginationParams: PaginationParams): Promise<PaginatedResponse<DriverType>> {
    try {
      logger.info('ℹ️ [DriversRepository.getDrivers] Getting drivers...');

      const whereCondition = [];
      if (filter.id) whereCondition.push(eq(DriversTable.id, filter.id));
      if (filter.name) whereCondition.push(like(DriversTable.name, `%${filter.name}%`));
      if (filter.status) whereCondition.push(eq(DriversTable.status, filter.status));

      const baseQuery = db
        .select()
        .from(DriversTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)
        .orderBy(DriversTable.name);

      const pageSize = paginationParams.pageSize || 20;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [DriversRepository.getDrivers] Drivers fetched successfully');
      return { query: data as DriverType[], pagination: paginatedQuery.pagination };
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

  /** Toggle clock in/out — sets clockedInAt to now, or clears it, based on the driver's current state. */
  async setDriverClock(id: string, clockedIn: boolean, tx?: DbTransaction): Promise<DriverType | null> {
    const dbClient = tx || db;
    const [record] = await dbClient
      .update(DriversTable)
      .set({ clockedInAt: clockedIn ? new Date() : null, updatedAt: new Date() })
      .where(eq(DriversTable.id, id))
      .returning();
    return record || null;
  }
}
