/**
 * Stock Unit Repository
 * 
 * @description Data access layer for Stock Unit (UOM) operations.
 */

import { db } from '@/db';
import { StockUnitTable, StockUnitType, StockUnitInsertType } from './stock-unit.model';
import { eq, and, like, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

// ============================================
// FILTER TYPES
// ============================================

export type StockUnitFilter = {
  stockUnitId?: string | string[];
  unitCode?: string | string[];
  unitName?: string;
  isActive?: boolean;
};

export class StockUnitRepositoryClass {
  constructor() {}

  /**
   * Get stock units with optional filtering and pagination
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters
   * @param organizationId - Organization ID for multi-tenant filtering
   * @returns Paginated stock units
   */
  async getStockUnit(filter: StockUnitFilter, paginationParams: PaginationParams, organizationId?: string): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [StockUnitRepository.getStockUnit] Getting stock units...');
      logger.debug('Filter:', filter);

      const whereCondition = [];

      // if (organizationId) {
      //   whereCondition.push(eq(StockUnitTable.organizationId, organizationId));
      // }

      if (Array.isArray(filter.stockUnitId)) {
        whereCondition.push(inArray(StockUnitTable.stockUnitId, filter.stockUnitId));
      } else if (filter.stockUnitId) {
        whereCondition.push(eq(StockUnitTable.stockUnitId, filter.stockUnitId));
      }

      if (Array.isArray(filter.unitCode)) {
        whereCondition.push(inArray(StockUnitTable.unitCode, filter.unitCode));
      } else if (filter.unitCode) {
        whereCondition.push(eq(StockUnitTable.unitCode, filter.unitCode));
      }

      if (filter.unitName) {
        whereCondition.push(like(StockUnitTable.unitName, `%${filter.unitName}%`));
      }

      if (filter.isActive !== undefined) {
        whereCondition.push(eq(StockUnitTable.isActive, filter.isActive));
      }

      const baseQuery = db
        .select()
        .from(StockUnitTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [StockUnitRepository.getStockUnit] Stock units fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [StockUnitRepository.getStockUnit] Error:', error);
      throw error;
    }
  }

  /**
   * Get stock unit by ID
   * @param id - Stock unit ID
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getStockUnitById(id: string, organizationId?: string): Promise<StockUnitType | null> {
    try {
      logger.info('ℹ️ [StockUnitRepository.getStockUnitById] Getting stock unit by ID...');
      const whereConditions = [eq(StockUnitTable.stockUnitId, id)];
      if (organizationId) {
        whereConditions.push(eq(StockUnitTable.organizationId, organizationId));
      }
      const [stockUnit] = await db
        .select()
        .from(StockUnitTable)
        .where(and(...whereConditions))
        .limit(1);

      logger.info('✅ [StockUnitRepository.getStockUnitById] Stock unit fetched successfully');
      return stockUnit || null;
    } catch (error) {
      logger.error('❌ [StockUnitRepository.getStockUnitById] Error:', error);
      throw error;
    }
  }

  /**
   * Get stock unit by code
   * @param code - Unit code
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getStockUnitByCode(code: string, organizationId?: string): Promise<StockUnitType | null> {
    try {
      logger.info('ℹ️ [StockUnitRepository.getStockUnitByCode] Getting stock unit by code...');
      const whereConditions = [eq(StockUnitTable.unitCode, code)];
        // if (organizationId) {
        //   whereConditions.push(eq(StockUnitTable.organizationId, organizationId));
        // }
      const [stockUnit] = await db
        .select()
        .from(StockUnitTable)
        .where(and(...whereConditions))
        .limit(1);

      logger.info('✅ [StockUnitRepository.getStockUnitByCode] Stock unit fetched successfully');
      return stockUnit || null;
    } catch (error) {
      logger.error('❌ [StockUnitRepository.getStockUnitByCode] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new stock unit
   * @param data - Stock unit data
   * @param tx - Optional transaction
   */
  async createStockUnit(data: Omit<StockUnitInsertType, 'stockUnitId' | 'createdAt' | 'updatedAt'>, tx?: DbTransaction): Promise<StockUnitType> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [StockUnitRepository.createStockUnit] Creating stock unit...');
      
      const [stockUnit] = await dbClient
        .insert(StockUnitTable)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      
      logger.info('✅ [StockUnitRepository.createStockUnit] Stock unit created successfully');
      return stockUnit;
    } catch (error) {
      logger.error('❌ [StockUnitRepository.createStockUnit] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing stock unit
   * @param data - Partial stock unit data
   * @param id - Stock unit ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   */
  async updateStockUnit(data: Partial<StockUnitInsertType>, id: string, organizationId?: string, tx?: DbTransaction): Promise<StockUnitType> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [StockUnitRepository.updateStockUnit] Updating stock unit...');
      const whereConditions = [eq(StockUnitTable.stockUnitId, id)];
      if (organizationId) {
        whereConditions.push(eq(StockUnitTable.organizationId, organizationId));
      }

      const [stockUnit] = await dbClient
        .update(StockUnitTable)
        .set({ ...data, updatedAt: new Date() })
        .where(and(...whereConditions))
        .returning();

      logger.info('✅ [StockUnitRepository.updateStockUnit] Stock unit updated successfully');
      return stockUnit;
    } catch (error) {
      logger.error('❌ [StockUnitRepository.updateStockUnit] Error:', error);
      throw error;
    }
  }

  /**
   * Toggle stock unit active status
   * @param id - Stock unit ID
   * @param isActive - New active status
   * @param updatedBy - User who made the update
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   */
  async toggleStockUnitActive(id: string, isActive: boolean, updatedBy: string, organizationId?: string, tx?: DbTransaction): Promise<StockUnitType> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [StockUnitRepository.toggleStockUnitActive] Toggling stock unit status...');
      const whereConditions = [eq(StockUnitTable.stockUnitId, id)];
      if (organizationId) {
        whereConditions.push(eq(StockUnitTable.organizationId, organizationId));
      }

      const [stockUnit] = await dbClient
        .update(StockUnitTable)
        .set({ isActive, updatedAt: new Date(), updatedBy })
        .where(and(...whereConditions))
        .returning();

      logger.info('✅ [StockUnitRepository.toggleStockUnitActive] Stock unit status updated');
      return stockUnit;
    } catch (error) {
      logger.error('❌ [StockUnitRepository.toggleStockUnitActive] Error:', error);
      throw error;
    }
  }

  /**
   * Delete a stock unit
   * @param id - Stock unit ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   */
  async deleteStockUnit(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [StockUnitRepository.deleteStockUnit] Deleting stock unit...');
      const whereConditions = [eq(StockUnitTable.stockUnitId, id)];
      // if (organizationId) {
      //   whereConditions.push(eq(StockUnitTable.organizationId, organizationId));
      // }

      await dbClient
        .delete(StockUnitTable)
        .where(and(...whereConditions));

      logger.info('✅ [StockUnitRepository.deleteStockUnit] Stock unit deleted successfully');
      return true;
    } catch (error) {
      logger.error('❌ [StockUnitRepository.deleteStockUnit] Error:', error);
      throw error;
    }
  }
}
