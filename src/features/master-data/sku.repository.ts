/**
 * SKU Repository
 * 
 * @description Data access layer for SKU (Stock Keeping Unit) operations.
 */

import { db } from '@/db';
import { SkuTable } from './sku.model';
import { SuppliersTable } from './suppliers.model';
import { InventoryBalancesTable } from '@/features/inventory/inventory-balance/inventory.model';
import { InventoryMovementsTable } from '@/features/inventory/inventory-movement/inventory.model';
import { eq, and, like, ilike, inArray, asc, desc } from 'drizzle-orm';
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
  /** Free-text search across skuCode and skuDescription (case-insensitive, partial match) */
  search?: string;
  isActive?: boolean;
  /** Sort field: SKU_CODE, SKU_DESCRIPTION, UPDATED_AT, CREATED_AT. Default: SKU_CODE */
  sortBy?: string;
  /** ASC or DESC. Default: ASC */
  sortOrder?: string;
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
  async getSku(filter: SkuFilter, paginationParams?: PaginationParams, tx?: DbTransaction, organizationId?: string): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [SkuRepository.getSku] Getting SKUs...');
      logger.debug('Filter:', filter);

      const whereCondition = [];
      const client = tx ?? db;

      if (organizationId) {
        whereCondition.push(eq(SkuTable.organizationId, organizationId));
      }

      if (Array.isArray(filter.skuId)) {
        whereCondition.push(inArray(SkuTable.skuId, filter.skuId));
      } else if (filter.skuId) {
        whereCondition.push(eq(SkuTable.skuId, filter.skuId));
      }

      if (Array.isArray(filter.skuCode)) {
        whereCondition.push(inArray(SkuTable.skuCode, filter.skuCode));
      } else if (filter.skuCode) {
        // Partial, case-insensitive match so combobox search finds codes like RAW-E0012
        whereCondition.push(ilike(SkuTable.skuCode, `%${filter.skuCode}%`));
      }

      if (filter.skuDescription) {
        whereCondition.push(like(SkuTable.skuDescription, `%${filter.skuDescription}%`));
      }

      if (filter.search) {
        const pattern = `%${filter.search}%`;
        whereCondition.push(
          or(
            ilike(SkuTable.skuCode, pattern),
            ilike(SkuTable.skuDescription, pattern),
          )!,
        );
      }

      if (filter.isActive !== undefined) {
        whereCondition.push(eq(SkuTable.isActive, filter.isActive));
      }

      const sortOrderFn = filter.sortOrder?.toUpperCase() === 'DESC' ? desc : asc;
      const sortBy = (filter.sortBy?.toUpperCase() ?? 'SKU_CODE') as string;
      const orderByColumn =
        sortBy === 'SKU_DESCRIPTION' ? SkuTable.skuDescription
        : sortBy === 'UPDATED_AT' ? SkuTable.updatedAt
        : sortBy === 'CREATED_AT' ? SkuTable.createdAt
        : SkuTable.skuCode;

      const baseQuery = client
        .select()
        .from(SkuTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)
        .orderBy(sortOrderFn(orderByColumn));

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
  async getSkuById(id: string, tx?: DbTransaction, organizationId?: string): Promise<SkuType | null> {
    try {
      logger.info('ℹ️ [SkuRepository.getSkuById] Getting SKU by ID...');
      const client = tx ?? db;
      const whereConditions = [eq(SkuTable.skuId, id)];
      if (organizationId) {
        whereConditions.push(eq(SkuTable.organizationId, organizationId));
      }
      const [sku] = await client
        .select()
        .from(SkuTable)
        .where(and(...whereConditions))
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
  async createSku(data: Omit<SkuInsertType, 'skuId' | 'createdAt' | 'updatedAt'> & { organizationId: string; initialOnHandQty?: number }, tx?: DbTransaction): Promise<SkuType> {
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

      if (!sku) {
        throw new Error('SKU insert did not return the created row');
      }

      const initialQty = data.initialOnHandQty ?? 0;

      // Create initial inventory balance record
      logger.info('ℹ️ [SkuRepository.createSku] Creating initial inventory balance...');
      await client
        .insert(InventoryBalancesTable)
        .values({
          skuId: sku.skuId,
          organizationId: data.organizationId,
          onHandQty: String(initialQty),
          lossQty: '0',
          reservedQty: '0',
        });
      logger.info('✅ [SkuRepository.createSku] Initial inventory balance created');

      // Create inventory movement for audit trail when initial stock is provided
      if (initialQty > 0) {
        logger.info('ℹ️ [SkuRepository.createSku] Creating stock initialization movement...');
        await client
          .insert(InventoryMovementsTable)
          .values({
            skuId: sku.skuId,
            movementType: 'ADJUSTMENT',
            quantity: String(initialQty),
            balanceAfter: String(initialQty),
            reason: 'Stock Initialization',
            createdBy: data.createdBy ?? 'system',
          });
        logger.info('✅ [SkuRepository.createSku] Stock initialization movement created');
      }

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
  async updateSku(id: string, data: Partial<SkuInsertType>, organizationId?: string, tx?: DbTransaction): Promise<SkuType | null> {
    try {
      logger.info('ℹ️ [SkuRepository.updateSku] Updating SKU...');

      // Validate supplier IDs reference existing suppliers if skuSuppliers is being updated
      if (data.skuSuppliers && Array.isArray(data.skuSuppliers)) {
        const supplierIds = data.skuSuppliers.map(s => s.supplierId);
        await this.validateSupplierIds(supplierIds);
      }

      const client = tx ?? db;
      const whereConditions = [eq(SkuTable.skuId, id)];
      if (organizationId) {
        whereConditions.push(eq(SkuTable.organizationId, organizationId));
      }
      const [sku] = await client
        .update(SkuTable)
        .set({ ...data, updatedAt: new Date() })
        .where(and(...whereConditions))
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
  async deleteSku(id: string, organizationId?: string): Promise<boolean> {
    try {
      logger.info('ℹ️ [SkuRepository.deleteSku] Deleting SKU...');
      const whereConditions = [eq(SkuTable.skuId, id)];
      if (organizationId) {
        whereConditions.push(eq(SkuTable.organizationId, organizationId));
      }
      await db.delete(SkuTable).where(and(...whereConditions));
      logger.info('✅ [SkuRepository.deleteSku] SKU deleted successfully');
      return true;
    } catch (error) {
      logger.error('❌ [SkuRepository.deleteSku] Error:', error);
      throw error;
    }
  }
}
