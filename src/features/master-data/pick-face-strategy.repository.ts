/**
 * Pick Face Strategy Repository
 *
 * @description Data access layer for Pick Face Strategy operations.
 */

import { db } from '@/db';
import { PickFaceStrategyTable, PickFaceStrategyType, PickFaceStrategyInsertType } from './pick-face-strategy.model';
import { SkuTable } from './sku.model';
import { RacksTable } from './racks.model';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

// ============================================
// FILTER TYPES
// ============================================

export type PickFaceStrategyFilter = {
  id?: string;
  skuId?: string;
  storageBinId?: string;
  binType?: string;
};

export class PickFaceStrategyRepositoryClass {
  constructor() {}

  /**
   * Get pick face strategies with optional filtering and pagination
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters
   * @param organizationId - Organization ID for multi-tenant filtering
   * @returns Paginated pick face strategies
   */
  async getPickFaceStrategies(filter: PickFaceStrategyFilter, paginationParams: PaginationParams, organizationId?: string): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [PickFaceStrategyRepository.getPickFaceStrategies] Getting pick face strategies...');
      logger.debug('Filter:', filter);

      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(PickFaceStrategyTable.organizationId, organizationId));
      }

      if (filter.id) {
        whereCondition.push(eq(PickFaceStrategyTable.id, filter.id));
      }

      if (filter.skuId) {
        whereCondition.push(eq(PickFaceStrategyTable.skuId, filter.skuId));
      }

      if (filter.storageBinId) {
        whereCondition.push(eq(PickFaceStrategyTable.storageBinId, filter.storageBinId));
      }

      if (filter.binType) {
        whereCondition.push(eq(PickFaceStrategyTable.binType, filter.binType));
      }

      const baseQuery = db
        .select({
          id: PickFaceStrategyTable.id,
          skuId: PickFaceStrategyTable.skuId,
          storageBinId: PickFaceStrategyTable.storageBinId,
          binType: PickFaceStrategyTable.binType,
          itemCode: PickFaceStrategyTable.itemCode,
          isActive: PickFaceStrategyTable.isActive,
          createdAt: PickFaceStrategyTable.createdAt,
          updatedAt: PickFaceStrategyTable.updatedAt,
          createdBy: PickFaceStrategyTable.createdBy,
          updatedBy: PickFaceStrategyTable.updatedBy,
          storageBin: RacksTable.binCode,
          skuDescription: SkuTable.skuDescription,
          rackRow: RacksTable.rackRow,
          rackColumn: RacksTable.rackColumn,
          rackLevel: RacksTable.rackLevel,
        })
        .from(PickFaceStrategyTable)
        .leftJoin(RacksTable, eq(PickFaceStrategyTable.storageBinId, RacksTable.rackId))
        .leftJoin(SkuTable, eq(PickFaceStrategyTable.skuId, SkuTable.skuId))
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [PickFaceStrategyRepository.getPickFaceStrategies] Pick face strategies fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [PickFaceStrategyRepository.getPickFaceStrategies] Error:', error);
      throw error;
    }
  }

  /**
   * Get pick face strategy by ID
   * @param id - Pick Face Strategy ID
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getPickFaceStrategyById(id: string, organizationId?: string): Promise<PickFaceStrategyType | null> {
    try {
      logger.info('ℹ️ [PickFaceStrategyRepository.getPickFaceStrategyById] Getting pick face strategy by ID...');
      const whereConditions = [eq(PickFaceStrategyTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(PickFaceStrategyTable.organizationId, organizationId));
      }
      const [strategy] = await db
        .select({
          id: PickFaceStrategyTable.id,
          organizationId: PickFaceStrategyTable.organizationId,
          skuId: PickFaceStrategyTable.skuId,
          storageBinId: PickFaceStrategyTable.storageBinId,
          binType: PickFaceStrategyTable.binType,
          itemCode: PickFaceStrategyTable.itemCode,
          isActive: PickFaceStrategyTable.isActive,
          createdAt: PickFaceStrategyTable.createdAt,
          updatedAt: PickFaceStrategyTable.updatedAt,
          createdBy: PickFaceStrategyTable.createdBy,
          updatedBy: PickFaceStrategyTable.updatedBy,
          storageBin: RacksTable.binCode,
          skuDescription: SkuTable.skuDescription,
          rackRow: RacksTable.rackRow,
          rackColumn: RacksTable.rackColumn,
          rackLevel: RacksTable.rackLevel,
        })
        .from(PickFaceStrategyTable)
        .leftJoin(RacksTable, eq(PickFaceStrategyTable.storageBinId, RacksTable.rackId))
        .leftJoin(SkuTable, eq(PickFaceStrategyTable.skuId, SkuTable.skuId))
        .where(and(...whereConditions))
        .limit(1);

      logger.info('✅ [PickFaceStrategyRepository.getPickFaceStrategyById] Pick face strategy fetched successfully');
      return strategy || null;
    } catch (error) {
      logger.error('❌ [PickFaceStrategyRepository.getPickFaceStrategyById] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new pick face strategy
   * @param data - Pick face strategy data
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Created pick face strategy
   */
  async createPickFaceStrategy(data: Omit<PickFaceStrategyInsertType, 'id' | 'createdAt' | 'updatedAt'> & { organizationId: string }, organizationId?: string, tx?: DbTransaction): Promise<PickFaceStrategyType> {
    try {
      logger.info('ℹ️ [PickFaceStrategyRepository.createPickFaceStrategy] Creating pick face strategy...');
      logger.debug('Data:', data);
      const dbClient = tx || db;
      const [newStrategy] = await dbClient.insert(PickFaceStrategyTable).values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      logger.info('✅ [PickFaceStrategyRepository.createPickFaceStrategy] Pick face strategy created successfully');
      return newStrategy || null;
    } catch (error) {
      logger.error('❌ [PickFaceStrategyRepository.createPickFaceStrategy] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing pick face strategy
   * @param data - Pick face strategy data
   * @param id - Pick Face Strategy ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Updated pick face strategy
   */
  async updatePickFaceStrategy(data: Partial<PickFaceStrategyInsertType>, id: string, organizationId?: string, tx?: DbTransaction): Promise<PickFaceStrategyType | null> {
    try {
      logger.info('ℹ️ [PickFaceStrategyRepository.updatePickFaceStrategy] Updating pick face strategy...');
      logger.debug('Data:', data);
      const dbClient = tx || db;
      const whereConditions = [eq(PickFaceStrategyTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(PickFaceStrategyTable.organizationId, organizationId));
      }
      const [updatedStrategy] = await dbClient.update(PickFaceStrategyTable).set({ ...data, updatedAt: new Date() }).where(and(...whereConditions)).returning();
      logger.info('✅ [PickFaceStrategyRepository.updatePickFaceStrategy] Pick face strategy updated successfully');
      return updatedStrategy || null;
    } catch (error) {
      logger.error('❌ [PickFaceStrategyRepository.updatePickFaceStrategy] Error:', error);
      throw error;
    }
  }

  /**
   * Delete an existing pick face strategy
   * @param id - Pick Face Strategy ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Deleted pick face strategy boolean
   */
  async deletePickFaceStrategy(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      logger.info('ℹ️ [PickFaceStrategyRepository.deletePickFaceStrategy] Deleting pick face strategy...');
      logger.debug('Pick Face Strategy ID:', id);
      const dbClient = tx || db;
      const whereConditions = [eq(PickFaceStrategyTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(PickFaceStrategyTable.organizationId, organizationId));
      }
      const result = await dbClient.delete(PickFaceStrategyTable).where(and(...whereConditions)).returning();
      logger.info('✅ [PickFaceStrategyRepository.deletePickFaceStrategy] Pick face strategy deleted successfully');
      return result.length > 0 ? true : false;
    } catch (error) {
      logger.error('❌ [PickFaceStrategyRepository.deletePickFaceStrategy] Error:', error);
      throw new Error('[PickFaceStrategyRepository.deletePickFaceStrategy] Error deleting pick face strategy');
    }
  }

  async getActiveBySkuId(skuId: string, organizationId?: string, tx?: DbTransaction): Promise<PickFaceStrategyType | null> {
    try {
      const dbClient = tx || db;
      const whereConditions = [
        eq(PickFaceStrategyTable.skuId, skuId),
        eq(PickFaceStrategyTable.isActive, true),
      ];
      if (organizationId) {
        whereConditions.push(eq(PickFaceStrategyTable.organizationId, organizationId));
      }
      const [strategy] = await dbClient
        .select()
        .from(PickFaceStrategyTable)
        .where(and(...whereConditions))
        .limit(1);
      return strategy ?? null;
    } catch (error) {
      logger.error('❌ [PickFaceStrategyRepository.getActiveBySkuId] Error:', error);
      throw error;
    }
  }
}
