/**
 * Areas Repository
 *
 * @description Data access layer for Area operations.
 */

import { db } from '@/db';
import { AreaInsertType, AreaTable, AreaType } from './area.model';
import { WarehousesTable } from './warehouses.model';
import { eq, and, like, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

// ============================================
// FILTER TYPES
// ============================================

export type AreaFilter = {
  areaId?: string | string[];
  mapId?: string | string[];
  areaCode?: string;
  areaName?: string;
};

export class AreaRepositoryClass {
  constructor() {}

  /**
   * Get areas with optional filtering and pagination
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters
   * @param organizationId - Organization ID for multi-tenant filtering
   * @returns Paginated areas
   */
  async getAreas(filter: AreaFilter, paginationParams: PaginationParams, organizationId?: string): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [AreaRepository.getAreas] Getting areas...');
      logger.debug('Filter:', filter);

      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(AreaTable.organizationId, organizationId));
      }

      if (Array.isArray(filter.areaId)) {
        whereCondition.push(inArray(AreaTable.areaId, filter.areaId));
      } else if (filter.areaId) {
        whereCondition.push(eq(AreaTable.areaId, filter.areaId));
      }

      if (Array.isArray(filter.mapId)) {
        whereCondition.push(inArray(AreaTable.mapId, filter.mapId));
      } else if (filter.mapId) {
        whereCondition.push(eq(AreaTable.mapId, filter.mapId));
      }

      if (filter.areaCode) {
        whereCondition.push(like(AreaTable.areaCode, `%${filter.areaCode}%`));
      }

      if (filter.areaName) {
        whereCondition.push(like(AreaTable.areaName, `%${filter.areaName}%`));
      }

      const baseQuery = db
        .select({
          areaId: AreaTable.areaId,
          mapId: AreaTable.mapId,
          areaCode: AreaTable.areaCode,
          areaName: AreaTable.areaName,
          areaDescription: AreaTable.areaDescription,
          warehouseName: WarehousesTable.warehouseName,
          createdAt: AreaTable.createdAt,
          updatedAt: AreaTable.updatedAt,
          createdBy: AreaTable.createdBy,
          updatedBy: AreaTable.updatedBy,
        })
        .from(AreaTable)
        .leftJoin(WarehousesTable, eq(AreaTable.warehouseId, WarehousesTable.warehouseId))
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [AreaRepository.getAreas] Areas fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [AreaRepository.getAreas] Error:', error);
      throw error;
    }
  }

  /**
   * Get area by ID
   * @param id - Area ID
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getAreaById(id: string, organizationId?: string): Promise<AreaType | null> {
    try {
      logger.info('ℹ️ [AreaRepository.getAreaById] Getting area by ID...');
      const whereConditions = [eq(AreaTable.areaId, id)];
      if (organizationId) {
        whereConditions.push(eq(AreaTable.organizationId, organizationId));
      }
      const [area] = await db
        .select()
        .from(AreaTable)
        .where(and(...whereConditions))
        .limit(1);

      logger.info('✅ [AreaRepository.getAreaById] Area fetched successfully');
      return area || null;
    } catch (error) {
      logger.error('❌ [AreaRepository.getAreaById] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new area
   * @param area - Area data
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Created area
   */
  async createArea(area: Omit<AreaInsertType, 'areaId' | 'createdAt' | 'updatedAt'> & { organizationId: string }, organizationId?: string, tx?: DbTransaction): Promise<AreaType> {
    try {
      logger.info('ℹ️ [AreaRepository.createArea] Creating area...');
      logger.debug('Area:', area);
      const dbClient = tx || db;
      const [newArea] = await dbClient.insert(AreaTable).values({
        ...area,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      logger.info('✅ [AreaRepository.createArea] Area created successfully');
      return newArea || null;
    } catch (error) {
      logger.error('❌ [AreaRepository.createArea] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing area
   * @param area - Area data
   * @param id - Area ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Updated area
   */
  async updateArea(area: Partial<AreaInsertType>, id: string, organizationId?: string, tx?: DbTransaction): Promise<AreaType | null> {
    try {
      logger.info('ℹ️ [AreaRepository.updateArea] Updating area...');
      logger.debug('Area:', area);
      const dbClient = tx || db;
      const whereConditions = [eq(AreaTable.areaId, id)];
      if (organizationId) {
        whereConditions.push(eq(AreaTable.organizationId, organizationId));
      }
      const [updatedArea] = await dbClient.update(AreaTable).set({ ...area, updatedAt: new Date() }).where(and(...whereConditions)).returning();
      logger.info('✅ [AreaRepository.updateArea] Area updated successfully');
      return updatedArea || null;
    } catch (error) {
      logger.error('❌ [AreaRepository.updateArea] Error:', error);
      throw error;
    }
  }

  /**
   * Delete an existing area
   * @param id - Area ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Deleted area boolean
   */
  async deleteArea(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      logger.info('ℹ️ [AreaRepository.deleteArea] Deleting area...');
      logger.debug('Area ID:', id);
      const dbClient = tx || db;
      const whereConditions = [eq(AreaTable.areaId, id)];
      if (organizationId) {
        whereConditions.push(eq(AreaTable.organizationId, organizationId));
      }
      const result = await dbClient.delete(AreaTable).where(and(...whereConditions)).returning();
      logger.info('✅ [AreaRepository.deleteArea] Area deleted successfully');
      return result.length > 0 ? true : false;
    } catch (error) {
      logger.error('❌ [AreaRepository.deleteArea] Error:', error);
      throw new Error('[AreaRepository.deleteArea] Error deleting area');
    }
  }
}
