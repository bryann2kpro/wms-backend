/**
 * SKU Repository
 * 
 * @description Data access layer for SKU (Stock Keeping Unit) operations.
 */

import { db } from '@/db';
import { SkuTable } from './sku.model';
import { SuppliersTable } from './suppliers.model';
import { eq, and, like, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';
import type { DbTransaction } from '@/types/db-transaction';

export type SkuType = typeof SkuTable.$inferSelect;
export type SkuInsertType = typeof SkuTable.$inferInsert;

// ============================================
// FILTER TYPES
// ============================================

export type SkuFilter = {
  skuId?: string | string[];
  skuCode?: string | string[];
  skuDescription?: string;
  isActive?: boolean;
};

export class SkuRepositoryClass {
  constructor() {}

  /**
   * Get SKUs with optional filtering and pagination
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters (optional - if not provided, returns all)
   * @param tx - Optional transaction for atomic operations
   * @returns Paginated SKUs or all SKUs if pagination not provided
   */
  async getSku(filter: SkuFilter, paginationParams?: PaginationParams, tx?: DbTransaction): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [SkuRepository.getSku] Getting SKUs...');
      logger.debug('Filter:', filter);

      const whereCondition = [];
      const client = tx ?? db;

      if (Array.isArray(filter.skuId)) {
        whereCondition.push(inArray(SkuTable.skuId, filter.skuId));
      } else if (filter.skuId) {
        whereCondition.push(eq(SkuTable.skuId, filter.skuId));
      }

      if (Array.isArray(filter.skuCode)) {
        whereCondition.push(inArray(SkuTable.skuCode, filter.skuCode));
      } else if (filter.skuCode) {
        whereCondition.push(eq(SkuTable.skuCode, filter.skuCode));
      }

      if (filter.skuDescription) {
        whereCondition.push(like(SkuTable.skuDescription, `%${filter.skuDescription}%`));
      }

      if (filter.isActive !== undefined) {
        whereCondition.push(eq(SkuTable.isActive, filter.isActive));
      }

      const baseQuery = client
        .select()
        .from(SkuTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      // If pagination params not provided, return all data
      if (!paginationParams || (!paginationParams.pageSize && !paginationParams.pageNumber)) {
        const data = await baseQuery;
        const totalCount = data.length;
        logger.info('✅ [SkuRepository.getSku] All SKUs fetched successfully (no pagination)');
        return {
          query: data,
          pagination: {
            count: totalCount,
            totalCount: totalCount,
            currentPage: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false,
          },
        };
      }

      // Apply pagination
      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [SkuRepository.getSku] SKUs fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [SkuRepository.getSku] Error:', error);
      throw error;
    }
  }

  /**
   * Get all SKUs (deprecated - use getSku with pagination instead)
   */
  async getAllSkus(): Promise<SkuType[]> {
    try {
      logger.info('ℹ️ [SkuRepository.getAllSkus] Getting all SKUs...');
      const skus = await db.select().from(SkuTable);
      logger.info('✅ [SkuRepository.getAllSkus] SKUs fetched successfully');
      return skus;
    } catch (error) {
      logger.error('❌ [SkuRepository.getAllSkus] Error:', error);
      throw error;
    }
  }

  /**
   * Get SKU by ID
   * @param tx - Optional transaction for atomic operations
   */
  async getSkuById(id: string, tx?: DbTransaction): Promise<SkuType | null> {
    try {
      logger.info('ℹ️ [SkuRepository.getSkuById] Getting SKU by ID...');
      const client = tx ?? db;
      const [sku] = await client
        .select()
        .from(SkuTable)
        .where(eq(SkuTable.skuId, id))
        .limit(1);
      
      logger.info('✅ [SkuRepository.getSkuById] SKU fetched successfully');
      return sku || null;
    } catch (error) {
      logger.error('❌ [SkuRepository.getSkuById] Error:', error);
      throw error;
    }
  }

  /**
   * Validate supplier IDs exist in the suppliers table
   */
  private async validateSupplierIds(supplierIds: string[]): Promise<void> {
    if (supplierIds.length === 0) return;

    try {
      const existingSuppliers = await db
        .select({ supplierId: SuppliersTable.supplierId })
        .from(SuppliersTable)
        .where(inArray(SuppliersTable.supplierId, supplierIds));

      const existingIds = new Set(existingSuppliers.map(s => s.supplierId));
      const invalidIds = supplierIds.filter(id => !existingIds.has(id));

      if (invalidIds.length > 0) {
        throw new Error(`Invalid supplier IDs: ${invalidIds.join(', ')}. These suppliers do not exist.`);
      }
    } catch (error) {
      logger.error('❌ [SkuRepository.validateSupplierIds] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new SKU
   * @param tx - Optional transaction for atomic operations
   */
  async createSku(data: Omit<SkuInsertType, 'skuId' | 'createdAt' | 'updatedAt'>, tx?: DbTransaction): Promise<SkuType> {
    try {
      logger.info('ℹ️ [SkuRepository.createSku] Creating SKU...');

      // Validate supplier IDs reference existing suppliers
      if (data.skuSuppliers && Array.isArray(data.skuSuppliers)) {
        const supplierIds = data.skuSuppliers.map(s => s.supplierId);
        await this.validateSupplierIds(supplierIds);
      }

      const client = tx ?? db;
      const [sku] = await client
        .insert(SkuTable)
        .values(data)
        .returning();

      logger.info('✅ [SkuRepository.createSku] SKU created successfully');
      return sku;
    } catch (error) {
      logger.error('❌ [SkuRepository.createSku] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing SKU
   * @param tx - Optional transaction for atomic operations
   */
  async updateSku(id: string, data: Partial<SkuInsertType>, tx?: DbTransaction): Promise<SkuType | null> {
    try {
      logger.info('ℹ️ [SkuRepository.updateSku] Updating SKU...');
      
      // Validate supplier IDs reference existing suppliers if skuSuppliers is being updated
      if (data.skuSuppliers && Array.isArray(data.skuSuppliers)) {
        const supplierIds = data.skuSuppliers.map(s => s.supplierId);
        await this.validateSupplierIds(supplierIds);
      }
      
      const client = tx ?? db;
      const [sku] = await client
        .update(SkuTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(SkuTable.skuId, id))
        .returning();
      
      logger.info('✅ [SkuRepository.updateSku] SKU updated successfully');
      return sku || null;
    } catch (error) {
      logger.error('❌ [SkuRepository.updateSku] Error:', error);
      throw error;
    }
  }

  /**
   * Delete a SKU
   */
  async deleteSku(id: string): Promise<boolean> {
    try {
      logger.info('ℹ️ [SkuRepository.deleteSku] Deleting SKU...');
      await db.delete(SkuTable).where(eq(SkuTable.skuId, id));
      logger.info('✅ [SkuRepository.deleteSku] SKU deleted successfully');
      return true;
    } catch (error) {
      logger.error('❌ [SkuRepository.deleteSku] Error:', error);
      throw error;
    }
  }
}
