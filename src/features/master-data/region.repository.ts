/**
 * Region Repository
 * 
 * @description Data access layer for Region operations.
 */

import { db } from '@/db';
import {
  RegionTable, RegionType, RegionInsertType,
  RegionPricingTable, RegionPricingType, RegionPricingInsertType,
} from './region.model';
import { eq, and, like, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

// ============================================
// FILTER TYPES
// ============================================

export type RegionFilter = {
  regionId?: string | string[];
  regionCode?: string | string[];
  regionName?: string;
};

export class RegionRepositoryClass {
  constructor() {}

  /**
   * Get regions with optional filtering and pagination
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters
   * @returns Paginated regions
   */
  async getRegion(filter: RegionFilter, paginationParams: PaginationParams): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [RegionRepository.getRegion] Getting regions...');
      logger.debug('Filter:', filter);

      const whereCondition = [];

      if (Array.isArray(filter.regionId)) {
        whereCondition.push(inArray(RegionTable.regionId, filter.regionId));
      } else if (filter.regionId) {
        whereCondition.push(eq(RegionTable.regionId, filter.regionId));
      }

      if (Array.isArray(filter.regionCode)) {
        whereCondition.push(inArray(RegionTable.regionCode, filter.regionCode));
      } else if (filter.regionCode) {
        whereCondition.push(eq(RegionTable.regionCode, filter.regionCode));
      }

      if (filter.regionName) {
        whereCondition.push(like(RegionTable.regionName, `%${filter.regionName}%`));
      }

      const baseQuery = db
        .select()
        .from(RegionTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [RegionRepository.getRegion] Regions fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [RegionRepository.getRegion] Error:', error);
      throw error;
    }
  }

  /**
   * Get region by ID
   */
  async getRegionById(id: string): Promise<RegionType | null> {
    try {
      logger.info('ℹ️ [RegionRepository.getRegionById] Getting region by ID...');
      const [region] = await db
        .select()
        .from(RegionTable)
        .where(eq(RegionTable.regionId, id))
        .limit(1);
      
      logger.info('✅ [RegionRepository.getRegionById] Region fetched successfully');
      return region || null;
    } catch (error) {
      logger.error('❌ [RegionRepository.getRegionById] Error:', error);
      throw error;
    }
  }

  async getRegionsByIds(ids: string[]): Promise<RegionType[]> {
    logger.info('ℹ️ [RegionRepository.getRegionsByIds] Getting regions by IDs...');
    if (ids.length === 0) return [];
    try {
      return await db
        .select()
        .from(RegionTable)
        .where(inArray(RegionTable.regionId, ids));
    } catch (error) {
      logger.error('❌ [RegionRepository.getRegionsByIds] Error:', error);
      throw error;
    }
  }

  /**
   * Get region by code
   */
  async getRegionByCode(code: string): Promise<RegionType | null> {
    try {
      logger.info('ℹ️ [RegionRepository.getRegionByCode] Getting region by code...');
      const [region] = await db
        .select()
        .from(RegionTable)
        .where(eq(RegionTable.regionCode, code))
        .limit(1);
      
      logger.info('✅ [RegionRepository.getRegionByCode] Region fetched successfully');
      return region || null;
    } catch (error) {
      logger.error('❌ [RegionRepository.getRegionByCode] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new region
   * @param data - Region data
   * @param tx - Optional transaction
   */
  async createRegion(data: Omit<RegionInsertType, 'regionId' | 'createdAt' | 'updatedAt'>, tx?: DbTransaction): Promise<RegionType> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [RegionRepository.createRegion] Creating region...');
      
      const [region] = await dbClient
        .insert(RegionTable)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      
      logger.info('✅ [RegionRepository.createRegion] Region created successfully');
      return region;
    } catch (error) {
      logger.error('❌ [RegionRepository.createRegion] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing region
   * @param data - Partial region data
   * @param id - Region ID
   * @param tx - Optional transaction
   */
  async updateRegion(data: Partial<RegionInsertType>, id: string, tx?: DbTransaction): Promise<RegionType> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [RegionRepository.updateRegion] Updating region...');
      
      const [region] = await dbClient
        .update(RegionTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(RegionTable.regionId, id))
        .returning();
      
      logger.info('✅ [RegionRepository.updateRegion] Region updated successfully');
      return region;
    } catch (error) {
      logger.error('❌ [RegionRepository.updateRegion] Error:', error);
      throw error;
    }
  }

  /**
   * Delete a region
   * @param id - Region ID
   * @param tx - Optional transaction
   */
  async deleteRegion(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [RegionRepository.deleteRegion] Deleting region...');
      
      await dbClient
        .delete(RegionTable)
        .where(eq(RegionTable.regionId, id));
      
      logger.info('✅ [RegionRepository.deleteRegion] Region deleted successfully');
      return true;
    } catch (error) {
      logger.error('❌ [RegionRepository.deleteRegion] Error:', error);
      throw error;
    }
  }

  // ============================================
  // Region Pricing
  // ============================================

  /**
   * Get the active pricing row for a region.
   * Returns null if no active pricing is configured.
   */
  async getRegionPricingByRegionId(regionId: string, tx?: DbTransaction): Promise<RegionPricingType | null> {
    try {
      const dbClient = tx || db;
      logger.info(`ℹ️ [RegionRepository.getRegionPricingByRegionId] regionId=${regionId}`);
      const [row] = await dbClient
        .select()
        .from(RegionPricingTable)
        .where(and(
          eq(RegionPricingTable.regionId, regionId),
          eq(RegionPricingTable.isActive, true),
        ))
        .limit(1);
      logger.info('✅ [RegionRepository.getRegionPricingByRegionId] Done');
      return row ?? null;
    } catch (error) {
      logger.error('❌ [RegionRepository.getRegionPricingByRegionId] Error:', error);
      throw error;
    }
  }

  /**
   * Upsert pricing for a region.
   * If an existing row exists for this regionId it is updated; otherwise a new row is inserted.
   */
  async upsertRegionPricing(
    regionId: string,
    data: { rate: string; minQty?: string; sstRate?: string; isActive?: boolean; updatedBy: string },
    tx?: DbTransaction,
  ): Promise<RegionPricingType> {
    try {
      const dbClient = tx || db;
      logger.info(`ℹ️ [RegionRepository.upsertRegionPricing] regionId=${regionId}`);

      const [existing] = await dbClient
        .select()
        .from(RegionPricingTable)
        .where(eq(RegionPricingTable.regionId, regionId))
        .limit(1);

      if (existing) {
        const [updated] = await dbClient
          .update(RegionPricingTable)
          .set({
            rate: data.rate,
            ...(data.minQty !== undefined ? { minQty: data.minQty } : {}),
            ...(data.sstRate !== undefined ? { sstRate: data.sstRate } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
            updatedBy: data.updatedBy,
            updatedAt: new Date(),
          })
          .where(eq(RegionPricingTable.regionId, regionId))
          .returning();
        logger.info('✅ [RegionRepository.upsertRegionPricing] Updated');
        return updated;
      }

      const [created] = await dbClient
        .insert(RegionPricingTable)
        .values({
          regionId,
          rate: data.rate,
          minQty: data.minQty ?? '5',
          sstRate: data.sstRate ?? '0.0600',
          isActive: data.isActive ?? true,
          createdBy: data.updatedBy,
          updatedBy: data.updatedBy,
        })
        .returning();
      logger.info('✅ [RegionRepository.upsertRegionPricing] Created');
      return created;
    } catch (error) {
      logger.error('❌ [RegionRepository.upsertRegionPricing] Error:', error);
      throw error;
    }
  }
}
