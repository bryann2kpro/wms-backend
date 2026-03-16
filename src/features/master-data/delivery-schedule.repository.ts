/**
 * Delivery Schedule Repository
 * 
 * @description Data access layer for Region Delivery Schedule operations.
 */

import { db } from '@/db';
import { 
  RegionDeliveryScheduleTable, 
  RegionDeliveryScheduleType, 
  RegionDeliveryScheduleInsertType,
  DayOfWeekLabel 
} from './delivery-date.model';
import { RegionTable } from './region.model';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

// ============================================
// FILTER TYPES
// ============================================

export type DeliveryScheduleFilter = {
  scheduleId?: string | string[];
  regionId?: string | string[];
  dayOfWeek?: number | number[];
  isActive?: boolean;
};

export type DeliveryScheduleWithRegion = RegionDeliveryScheduleType & {
  regionName: string;
  regionCode: string;
  dayName: string;
};

export class DeliveryScheduleRepositoryClass {
  constructor() {}

  /**
   * Get delivery schedules with optional filtering and pagination
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters
   * @param organizationId - Organization ID for multi-tenant filtering
   * @returns Paginated delivery schedules with region info
   */
  async getDeliverySchedule(filter: DeliveryScheduleFilter, paginationParams: PaginationParams, organizationId?: string): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [DeliveryScheduleRepository.getDeliverySchedule] Getting schedules...');
      logger.debug('Filter:', filter);

      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(RegionDeliveryScheduleTable.organizationId, organizationId));
      }

      if (Array.isArray(filter.scheduleId)) {
        whereCondition.push(inArray(RegionDeliveryScheduleTable.scheduleId, filter.scheduleId));
      } else if (filter.scheduleId) {
        whereCondition.push(eq(RegionDeliveryScheduleTable.scheduleId, filter.scheduleId));
      }

      if (Array.isArray(filter.regionId)) {
        whereCondition.push(inArray(RegionDeliveryScheduleTable.regionId, filter.regionId));
      } else if (filter.regionId) {
        whereCondition.push(eq(RegionDeliveryScheduleTable.regionId, filter.regionId));
      }

      if (Array.isArray(filter.dayOfWeek)) {
        whereCondition.push(inArray(RegionDeliveryScheduleTable.dayOfWeek, filter.dayOfWeek));
      } else if (filter.dayOfWeek !== undefined) {
        whereCondition.push(eq(RegionDeliveryScheduleTable.dayOfWeek, filter.dayOfWeek));
      }

      if (filter.isActive !== undefined) {
        whereCondition.push(eq(RegionDeliveryScheduleTable.isActive, filter.isActive));
      }

      const baseQuery = db
        .select({
          scheduleId: RegionDeliveryScheduleTable.scheduleId,
          regionId: RegionDeliveryScheduleTable.regionId,
          dayOfWeek: RegionDeliveryScheduleTable.dayOfWeek,
          cutoffDaysBefore: RegionDeliveryScheduleTable.cutoffDaysBefore,
          cutoffTime: RegionDeliveryScheduleTable.cutoffTime,
          isActive: RegionDeliveryScheduleTable.isActive,
          createdAt: RegionDeliveryScheduleTable.createdAt,
          updatedAt: RegionDeliveryScheduleTable.updatedAt,
          createdBy: RegionDeliveryScheduleTable.createdBy,
          updatedBy: RegionDeliveryScheduleTable.updatedBy,
          regionName: RegionTable.regionName,
          regionCode: RegionTable.regionCode,
        })
        .from(RegionDeliveryScheduleTable)
        .innerJoin(RegionTable, eq(RegionDeliveryScheduleTable.regionId, RegionTable.regionId))
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      // Add day name
      const result = data.map((s: any) => ({
        ...s,
        dayName: DayOfWeekLabel[s.dayOfWeek] || 'Unknown',
      }));

      logger.info('✅ [DeliveryScheduleRepository.getDeliverySchedule] Schedules fetched successfully');
      return { query: result, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [DeliveryScheduleRepository.getDeliverySchedule] Error:', error);
      throw error;
    }
  }

  /**
   * Get all active delivery schedules for a region.
   * Returns all delivery days (with cutoff info) for the given region.
   * @param regionId - Region ID
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getSchedulesByRegion(regionId: string, organizationId?: string): Promise<DeliveryScheduleWithRegion[]> {
    try {
      logger.info('ℹ️ [DeliveryScheduleRepository.getSchedulesByRegion] Getting schedules for region...');
      const whereConditions = [
        eq(RegionDeliveryScheduleTable.regionId, regionId),
        eq(RegionDeliveryScheduleTable.isActive, true)
      ];
      if (organizationId) {
        whereConditions.push(eq(RegionDeliveryScheduleTable.organizationId, organizationId));
      }
      const schedules = await db
        .select({
          scheduleId: RegionDeliveryScheduleTable.scheduleId,
          regionId: RegionDeliveryScheduleTable.regionId,
          dayOfWeek: RegionDeliveryScheduleTable.dayOfWeek,
          cutoffDaysBefore: RegionDeliveryScheduleTable.cutoffDaysBefore,
          cutoffTime: RegionDeliveryScheduleTable.cutoffTime,
          isActive: RegionDeliveryScheduleTable.isActive,
          createdAt: RegionDeliveryScheduleTable.createdAt,
          updatedAt: RegionDeliveryScheduleTable.updatedAt,
          createdBy: RegionDeliveryScheduleTable.createdBy,
          updatedBy: RegionDeliveryScheduleTable.updatedBy,
          regionName: RegionTable.regionName,
          regionCode: RegionTable.regionCode,
        })
        .from(RegionDeliveryScheduleTable)
        .innerJoin(RegionTable, eq(RegionDeliveryScheduleTable.regionId, RegionTable.regionId))
        .where(and(...whereConditions));

      return schedules.map((s) => ({
        ...s,
        dayName: DayOfWeekLabel[s.dayOfWeek] ?? 'Unknown',
      }));
    } catch (error) {
      logger.error('❌ [DeliveryScheduleRepository.getSchedulesByRegion] Error:', error);
      throw error;
    }
  }

  /**
   * Get the delivery schedule (cutoff) for a region and day of week.
   * Use when you need the next cutoff for a specific region + day inside a transaction.
   * @param regionId - Region ID
   * @param dayOfWeek - Day of week
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getScheduleByRegionAndDay(
    regionId: string,
    dayOfWeek: number,
    organizationId?: string,
  ): Promise<DeliveryScheduleWithRegion | null> {
    try {
      const whereConditions = [
        eq(RegionDeliveryScheduleTable.regionId, regionId),
        eq(RegionDeliveryScheduleTable.dayOfWeek, dayOfWeek),
        eq(RegionDeliveryScheduleTable.isActive, true)
      ];
      if (organizationId) {
        whereConditions.push(eq(RegionDeliveryScheduleTable.organizationId, organizationId));
      }
      const [schedule] = await db
        .select({
          scheduleId: RegionDeliveryScheduleTable.scheduleId,
          regionId: RegionDeliveryScheduleTable.regionId,
          dayOfWeek: RegionDeliveryScheduleTable.dayOfWeek,
          cutoffDaysBefore: RegionDeliveryScheduleTable.cutoffDaysBefore,
          cutoffTime: RegionDeliveryScheduleTable.cutoffTime,
          isActive: RegionDeliveryScheduleTable.isActive,
          createdAt: RegionDeliveryScheduleTable.createdAt,
          updatedAt: RegionDeliveryScheduleTable.updatedAt,
          createdBy: RegionDeliveryScheduleTable.createdBy,
          updatedBy: RegionDeliveryScheduleTable.updatedBy,
          regionName: RegionTable.regionName,
          regionCode: RegionTable.regionCode,
        })
        .from(RegionDeliveryScheduleTable)
        .innerJoin(RegionTable, eq(RegionDeliveryScheduleTable.regionId, RegionTable.regionId))
        .where(and(...whereConditions))
        .limit(1);

      if (!schedule) return null;
      return {
        ...schedule,
        dayName: DayOfWeekLabel[schedule.dayOfWeek] ?? 'Unknown',
      };
    } catch (error) {
      logger.error('❌ [DeliveryScheduleRepository.getScheduleByRegionAndDay] Error:', error);
      throw error;
    }
  }

  /**
   * Get schedule by ID
   * @param id - Schedule ID
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getScheduleById(id: string, organizationId?: string): Promise<DeliveryScheduleWithRegion | null> {
    try {
      logger.info('ℹ️ [DeliveryScheduleRepository.getScheduleById] Getting schedule by ID...');
      const whereConditions = [eq(RegionDeliveryScheduleTable.scheduleId, id)];
      if (organizationId) {
        whereConditions.push(eq(RegionDeliveryScheduleTable.organizationId, organizationId));
      }
      const [schedule] = await db
        .select({
          scheduleId: RegionDeliveryScheduleTable.scheduleId,
          regionId: RegionDeliveryScheduleTable.regionId,
          dayOfWeek: RegionDeliveryScheduleTable.dayOfWeek,
          cutoffDaysBefore: RegionDeliveryScheduleTable.cutoffDaysBefore,
          cutoffTime: RegionDeliveryScheduleTable.cutoffTime,
          isActive: RegionDeliveryScheduleTable.isActive,
          createdAt: RegionDeliveryScheduleTable.createdAt,
          updatedAt: RegionDeliveryScheduleTable.updatedAt,
          createdBy: RegionDeliveryScheduleTable.createdBy,
          updatedBy: RegionDeliveryScheduleTable.updatedBy,
          regionName: RegionTable.regionName,
          regionCode: RegionTable.regionCode,
        })
        .from(RegionDeliveryScheduleTable)
        .innerJoin(RegionTable, eq(RegionDeliveryScheduleTable.regionId, RegionTable.regionId))
        .where(and(...whereConditions))
        .limit(1);
      
      if (!schedule) {
        logger.info('✅ [DeliveryScheduleRepository.getScheduleById] Schedule not found');
        return null;
      }

      logger.info('✅ [DeliveryScheduleRepository.getScheduleById] Schedule fetched successfully');
      return {
        ...schedule,
        dayName: DayOfWeekLabel[schedule.dayOfWeek] || 'Unknown',
      };
    } catch (error) {
      logger.error('❌ [DeliveryScheduleRepository.getScheduleById] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new delivery schedule
   * @param data - Schedule data
   * @param tx - Optional transaction
   */
  async createDeliverySchedule(data: Omit<RegionDeliveryScheduleInsertType, 'scheduleId' | 'createdAt' | 'updatedAt'>, tx?: DbTransaction): Promise<RegionDeliveryScheduleType> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [DeliveryScheduleRepository.createDeliverySchedule] Creating schedule...');
      
      const [schedule] = await dbClient
        .insert(RegionDeliveryScheduleTable)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      
      logger.info('✅ [DeliveryScheduleRepository.createDeliverySchedule] Schedule created successfully');
      return schedule;
    } catch (error) {
      logger.error('❌ [DeliveryScheduleRepository.createDeliverySchedule] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing delivery schedule
   * @param data - Partial schedule data
   * @param id - Schedule ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   */
  async updateDeliverySchedule(data: Partial<RegionDeliveryScheduleInsertType>, id: string, organizationId?: string, tx?: DbTransaction): Promise<RegionDeliveryScheduleType> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [DeliveryScheduleRepository.updateDeliverySchedule] Updating schedule...');
      const whereConditions = [eq(RegionDeliveryScheduleTable.scheduleId, id)];
      if (organizationId) {
        whereConditions.push(eq(RegionDeliveryScheduleTable.organizationId, organizationId));
      }

      const [schedule] = await dbClient
        .update(RegionDeliveryScheduleTable)
        .set({ ...data, updatedAt: new Date() })
        .where(and(...whereConditions))
        .returning();
      
      logger.info('✅ [DeliveryScheduleRepository.updateDeliverySchedule] Schedule updated successfully');
      return schedule;
    } catch (error) {
      logger.error('❌ [DeliveryScheduleRepository.updateDeliverySchedule] Error:', error);
      throw error;
    }
  }

  /**
   * Delete a delivery schedule
   * @param id - Schedule ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   */
  async deleteDeliverySchedule(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [DeliveryScheduleRepository.deleteDeliverySchedule] Deleting schedule...');
      const whereConditions = [eq(RegionDeliveryScheduleTable.scheduleId, id)];
      if (organizationId) {
        whereConditions.push(eq(RegionDeliveryScheduleTable.organizationId, organizationId));
      }

      await dbClient
        .delete(RegionDeliveryScheduleTable)
        .where(and(...whereConditions));
      
      logger.info('✅ [DeliveryScheduleRepository.deleteDeliverySchedule] Schedule deleted successfully');
      return true;
    } catch (error) {
      logger.error('❌ [DeliveryScheduleRepository.deleteDeliverySchedule] Error:', error);
      throw error;
    }
  }

  /**
   * Toggle schedule active status
   * @param id - Schedule ID
   * @param isActive - New active status
   * @param updatedBy - User who made the update
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   */
  async toggleScheduleActive(id: string, isActive: boolean, updatedBy: string, organizationId?: string, tx?: DbTransaction): Promise<RegionDeliveryScheduleType> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [DeliveryScheduleRepository.toggleScheduleActive] Toggling schedule status...');
      const whereConditions = [eq(RegionDeliveryScheduleTable.scheduleId, id)];
      if (organizationId) {
        whereConditions.push(eq(RegionDeliveryScheduleTable.organizationId, organizationId));
      }

      const [schedule] = await dbClient
        .update(RegionDeliveryScheduleTable)
        .set({ isActive, updatedAt: new Date(), updatedBy })
        .where(and(...whereConditions))
        .returning();
      
      logger.info('✅ [DeliveryScheduleRepository.toggleScheduleActive] Schedule status updated');
      return schedule;
    } catch (error) {
      logger.error('❌ [DeliveryScheduleRepository.toggleScheduleActive] Error:', error);
      throw error;
    }
  }
}
