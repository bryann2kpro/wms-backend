/**
 * Pickup Criteria Repository
 *
 * @description Data access layer for PickupCriteria operations.
 */

import { db } from '@/db';
import { PickupCriteriaTable, PickupCriteriaType, PickupCriteriaInsertType } from './pickup-criteria.model';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

// ============================================
// FILTER TYPES
// ============================================

export type PickupCriteriaFilter = {
  id?: string;
  skuId?: string;
  strategy?: string;
};

export class PickupCriteriaRepositoryClass {
  constructor() {}

  /**
   * Get pickup criterias with optional filtering and pagination
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters
   * @param organizationId - Organization ID for multi-tenant filtering
   * @returns Paginated pickup criterias
   */
  async getPickupCriterias(filter: PickupCriteriaFilter, paginationParams: PaginationParams, organizationId?: string): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [PickupCriteriaRepository.getPickupCriterias] Getting pickup criterias...');
      logger.debug('Filter:', filter);

      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(PickupCriteriaTable.organizationId, organizationId));
      }

      if (filter.id) {
        whereCondition.push(eq(PickupCriteriaTable.id, filter.id));
      }

      if (filter.skuId) {
        whereCondition.push(eq(PickupCriteriaTable.skuId, filter.skuId));
      }

      if (filter.strategy) {
        whereCondition.push(eq(PickupCriteriaTable.strategy, filter.strategy));
      }

      const baseQuery = db
        .select({
          id: PickupCriteriaTable.id,
          organizationId: PickupCriteriaTable.organizationId,
          skuId: PickupCriteriaTable.skuId,
          strategy: PickupCriteriaTable.strategy,
          priorityOverride: PickupCriteriaTable.priorityOverride,
          createdAt: PickupCriteriaTable.createdAt,
          updatedAt: PickupCriteriaTable.updatedAt,
          createdBy: PickupCriteriaTable.createdBy,
          updatedBy: PickupCriteriaTable.updatedBy,
        })
        .from(PickupCriteriaTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [PickupCriteriaRepository.getPickupCriterias] Pickup criterias fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [PickupCriteriaRepository.getPickupCriterias] Error:', error);
      throw error;
    }
  }

  /**
   * Get pickup criteria by ID
   * @param id - Pickup Criteria ID
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getPickupCriteriaById(id: string, organizationId?: string): Promise<PickupCriteriaType | null> {
    try {
      logger.info('ℹ️ [PickupCriteriaRepository.getPickupCriteriaById] Getting pickup criteria by ID...');
      const whereConditions = [eq(PickupCriteriaTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(PickupCriteriaTable.organizationId, organizationId));
      }
      const [record] = await db
        .select()
        .from(PickupCriteriaTable)
        .where(and(...whereConditions))
        .limit(1);

      logger.info('✅ [PickupCriteriaRepository.getPickupCriteriaById] Pickup criteria fetched successfully');
      return record || null;
    } catch (error) {
      logger.error('❌ [PickupCriteriaRepository.getPickupCriteriaById] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new pickup criteria
   * @param data - Pickup criteria data
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Created pickup criteria
   */
  async createPickupCriteria(data: Omit<PickupCriteriaInsertType, 'id' | 'createdAt' | 'updatedAt'> & { organizationId: string }, organizationId?: string, tx?: DbTransaction): Promise<PickupCriteriaType> {
    try {
      logger.info('ℹ️ [PickupCriteriaRepository.createPickupCriteria] Creating pickup criteria...');
      logger.debug('Data:', data);
      const dbClient = tx || db;
      const [newRecord] = await dbClient.insert(PickupCriteriaTable).values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      logger.info('✅ [PickupCriteriaRepository.createPickupCriteria] Pickup criteria created successfully');
      return newRecord || null;
    } catch (error) {
      logger.error('❌ [PickupCriteriaRepository.createPickupCriteria] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing pickup criteria
   * @param data - Pickup criteria data
   * @param id - Pickup Criteria ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Updated pickup criteria
   */
  async updatePickupCriteria(data: Partial<PickupCriteriaInsertType>, id: string, organizationId?: string, tx?: DbTransaction): Promise<PickupCriteriaType | null> {
    try {
      logger.info('ℹ️ [PickupCriteriaRepository.updatePickupCriteria] Updating pickup criteria...');
      logger.debug('Data:', data);
      const dbClient = tx || db;
      const whereConditions = [eq(PickupCriteriaTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(PickupCriteriaTable.organizationId, organizationId));
      }
      const [updatedRecord] = await dbClient.update(PickupCriteriaTable).set({ ...data, updatedAt: new Date() }).where(and(...whereConditions)).returning();
      logger.info('✅ [PickupCriteriaRepository.updatePickupCriteria] Pickup criteria updated successfully');
      return updatedRecord || null;
    } catch (error) {
      logger.error('❌ [PickupCriteriaRepository.updatePickupCriteria] Error:', error);
      throw error;
    }
  }

  /**
   * Delete an existing pickup criteria
   * @param id - Pickup Criteria ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Deleted pickup criteria boolean
   */
  async deletePickupCriteria(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      logger.info('ℹ️ [PickupCriteriaRepository.deletePickupCriteria] Deleting pickup criteria...');
      logger.debug('Pickup Criteria ID:', id);
      const dbClient = tx || db;
      const whereConditions = [eq(PickupCriteriaTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(PickupCriteriaTable.organizationId, organizationId));
      }
      const result = await dbClient.delete(PickupCriteriaTable).where(and(...whereConditions)).returning();
      logger.info('✅ [PickupCriteriaRepository.deletePickupCriteria] Pickup criteria deleted successfully');
      return result.length > 0 ? true : false;
    } catch (error) {
      logger.error('❌ [PickupCriteriaRepository.deletePickupCriteria] Error:', error);
      throw new Error('[PickupCriteriaRepository.deletePickupCriteria] Error deleting pickup criteria');
    }
  }
}
