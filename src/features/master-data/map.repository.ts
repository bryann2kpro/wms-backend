/**
 * Map Repository
 *
 * @description Data access layer for Map operations.
 */

import { db } from '@/db';
import { MapInsertType, MapTable, MapType } from './map.model';
import { eq, and, like, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

// ============================================
// FILTER TYPES
// ============================================

export type MapFilter = {
  mapId?: string | string[];
  mapCode?: string;
  mapName?: string;
};

export class MapRepositoryClass {
  constructor() {}

  /**
   * Get maps with optional filtering and pagination
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters
   * @param organizationId - Organization ID for multi-tenant filtering
   * @returns Paginated maps
   */
  async getMaps(filter: MapFilter, paginationParams: PaginationParams, organizationId?: string): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [MapRepository.getMaps] Getting maps...');
      logger.debug('Filter:', filter);

      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(MapTable.organizationId, organizationId));
      }

      if (Array.isArray(filter.mapId)) {
        whereCondition.push(inArray(MapTable.mapId, filter.mapId));
      } else if (filter.mapId) {
        whereCondition.push(eq(MapTable.mapId, filter.mapId));
      }

      if (filter.mapCode) {
        whereCondition.push(like(MapTable.mapCode, `%${filter.mapCode}%`));
      }

      if (filter.mapName) {
        whereCondition.push(like(MapTable.mapName, `%${filter.mapName}%`));
      }

      const baseQuery = db
        .select({
          mapId: MapTable.mapId,
          mapCode: MapTable.mapCode,
          mapName: MapTable.mapName,
          mapDescription: MapTable.mapDescription,
          createdAt: MapTable.createdAt,
          updatedAt: MapTable.updatedAt,
          createdBy: MapTable.createdBy,
          updatedBy: MapTable.updatedBy,
        })
        .from(MapTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [MapRepository.getMaps] Maps fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [MapRepository.getMaps] Error:', error);
      throw error;
    }
  }

  /**
   * Get map by ID
   * @param id - Map ID
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getMapById(id: string, organizationId?: string): Promise<MapType | null> {
    try {
      logger.info('ℹ️ [MapRepository.getMapById] Getting map by ID...');
      const whereConditions = [eq(MapTable.mapId, id)];
      if (organizationId) {
        whereConditions.push(eq(MapTable.organizationId, organizationId));
      }
      const [map] = await db
        .select()
        .from(MapTable)
        .where(and(...whereConditions))
        .limit(1);

      logger.info('✅ [MapRepository.getMapById] Map fetched successfully');
      return map || null;
    } catch (error) {
      logger.error('❌ [MapRepository.getMapById] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new map
   * @param map - Map data
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Created map
   */
  async createMap(map: Omit<MapInsertType, 'mapId' | 'createdAt' | 'updatedAt'> & { organizationId: string }, organizationId?: string, tx?: DbTransaction): Promise<MapType> {
    try {
      logger.info('ℹ️ [MapRepository.createMap] Creating map...');
      logger.debug('Map:', map);
      const dbClient = tx || db;
      const [newMap] = await dbClient.insert(MapTable).values({
        ...map,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      logger.info('✅ [MapRepository.createMap] Map created successfully');
      return newMap || null;
    } catch (error) {
      logger.error('❌ [MapRepository.createMap] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing map
   * @param map - Map data
   * @param id - Map ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Updated map
   */
  async updateMap(map: Partial<MapInsertType>, id: string, organizationId?: string, tx?: DbTransaction): Promise<MapType | null> {
    try {
      logger.info('ℹ️ [MapRepository.updateMap] Updating map...');
      logger.debug('Map:', map);
      const dbClient = tx || db;
      const whereConditions = [eq(MapTable.mapId, id)];
      if (organizationId) {
        whereConditions.push(eq(MapTable.organizationId, organizationId));
      }
      const [updatedMap] = await dbClient.update(MapTable).set({ ...map, updatedAt: new Date() }).where(and(...whereConditions)).returning();
      logger.info('✅ [MapRepository.updateMap] Map updated successfully');
      return updatedMap || null;
    } catch (error) {
      logger.error('❌ [MapRepository.updateMap] Error:', error);
      throw error;
    }
  }

  /**
   * Delete an existing map
   * @param id - Map ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Deleted map boolean
   */
  async deleteMap(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      logger.info('ℹ️ [MapRepository.deleteMap] Deleting map...');
      logger.debug('Map ID:', id);
      const dbClient = tx || db;
      const whereConditions = [eq(MapTable.mapId, id)];
      if (organizationId) {
        whereConditions.push(eq(MapTable.organizationId, organizationId));
      }
      const result = await dbClient.delete(MapTable).where(and(...whereConditions)).returning();
      logger.info('✅ [MapRepository.deleteMap] Map deleted successfully');
      return result.length > 0 ? true : false;
    } catch (error) {
      logger.error('❌ [MapRepository.deleteMap] Error:', error);
      throw new Error('[MapRepository.deleteMap] Error deleting map');
    }
  }
}
