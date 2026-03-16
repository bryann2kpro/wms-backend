/**
 * Suppliers Repository
 * 
 * @description Data access layer for Supplier operations.
 */

import { db } from '@/db';
import { SuppliersTable } from './suppliers.model';
import { eq, and, like, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

// ============================================
// TYPES
// ============================================

export type SupplierType = typeof SuppliersTable.$inferSelect;
export type SupplierInsertType = typeof SuppliersTable.$inferInsert;

export type SupplierFilter = {
  supplierId?: string | string[];
  supplierCode?: string | string[];
  supplierName?: string;
};

export class SuppliersRepositoryClass {
  constructor() {}

  /**
   * Get suppliers with optional filtering and pagination
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters
   * @returns Paginated suppliers
   */
  async getSupplier(filter: SupplierFilter, paginationParams: PaginationParams, organizationId?: string): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [SuppliersRepository.getSupplier] Getting suppliers...');
      logger.debug('Filter:', filter);

      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(SuppliersTable.organizationId, organizationId));
      }

      if (Array.isArray(filter.supplierId)) {
        whereCondition.push(inArray(SuppliersTable.supplierId, filter.supplierId));
      } else if (filter.supplierId) {
        whereCondition.push(eq(SuppliersTable.supplierId, filter.supplierId));
      }

      if (Array.isArray(filter.supplierCode)) {
        whereCondition.push(inArray(SuppliersTable.supplierCode, filter.supplierCode));
      } else if (filter.supplierCode) {
        whereCondition.push(eq(SuppliersTable.supplierCode, filter.supplierCode));
      }

      if (filter.supplierName) {
        whereCondition.push(like(SuppliersTable.supplierName, `%${filter.supplierName}%`));
      }

      const baseQuery = db
        .select()
        .from(SuppliersTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [SuppliersRepository.getSupplier] Suppliers fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [SuppliersRepository.getSupplier] Error:', error);
      throw error;
    }
  }

  /**
   * Get supplier by ID
   */
  async getSupplierById(id: string, organizationId?: string): Promise<SupplierType | null> {
    try {
      logger.info('ℹ️ [SuppliersRepository.getSupplierById] Getting supplier by ID...');
      const whereConditions = [eq(SuppliersTable.supplierId, id)];
      if (organizationId) {
        whereConditions.push(eq(SuppliersTable.organizationId, organizationId));
      }
      const [supplier] = await db
        .select()
        .from(SuppliersTable)
        .where(and(...whereConditions))
        .limit(1);
      
      logger.info('✅ [SuppliersRepository.getSupplierById] Supplier fetched successfully');
      return supplier || null;
    } catch (error) {
      logger.error('❌ [SuppliersRepository.getSupplierById] Error:', error);
      throw error;
    }
  }

  /**
   * Get supplier by code
   */
  async getSupplierByCode(code: string, organizationId?: string): Promise<SupplierType | null> {
    try {
      logger.info('ℹ️ [SuppliersRepository.getSupplierByCode] Getting supplier by code...');
      const whereConditions = [eq(SuppliersTable.supplierCode, code)];
      if (organizationId) {
        whereConditions.push(eq(SuppliersTable.organizationId, organizationId));
      }
      const [supplier] = await db
        .select()
        .from(SuppliersTable)
        .where(and(...whereConditions))
        .limit(1);
      
      logger.info('✅ [SuppliersRepository.getSupplierByCode] Supplier fetched successfully');
      return supplier || null;
    } catch (error) {
      logger.error('❌ [SuppliersRepository.getSupplierByCode] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new supplier
   * @param data - Supplier data
   * @param tx - Optional transaction
   */
  async createSupplier(data: Omit<SupplierInsertType, 'supplierId' | 'createdAt' | 'updatedAt'> & { organizationId: string }, tx?: DbTransaction): Promise<SupplierType> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [SuppliersRepository.createSupplier] Creating supplier...');

      const [supplier] = await dbClient
        .insert(SuppliersTable)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      
      logger.info('✅ [SuppliersRepository.createSupplier] Supplier created successfully');
      return supplier;
    } catch (error) {
      logger.error('❌ [SuppliersRepository.createSupplier] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing supplier
   * @param data - Partial supplier data
   * @param id - Supplier ID
   * @param tx - Optional transaction
   */
  async updateSupplier(data: Partial<SupplierInsertType>, id: string, organizationId?: string, tx?: DbTransaction): Promise<SupplierType> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [SuppliersRepository.updateSupplier] Updating supplier...');
      const whereConditions = [eq(SuppliersTable.supplierId, id)];
      if (organizationId) {
        whereConditions.push(eq(SuppliersTable.organizationId, organizationId));
      }

      const [supplier] = await dbClient
        .update(SuppliersTable)
        .set({ ...data, updatedAt: new Date() })
        .where(and(...whereConditions))
        .returning();
      
      logger.info('✅ [SuppliersRepository.updateSupplier] Supplier updated successfully');
      return supplier;
    } catch (error) {
      logger.error('❌ [SuppliersRepository.updateSupplier] Error:', error);
      throw error;
    }
  }

  /**
   * Delete a supplier
   * @param id - Supplier ID
   * @param organizationId - Organization ID (for multi-tenant filtering)
   * @param tx - Optional transaction
   */
  async deleteSupplier(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [SuppliersRepository.deleteSupplier] Deleting supplier...');
      const whereConditions = [eq(SuppliersTable.supplierId, id)];
      if (organizationId) {
        whereConditions.push(eq(SuppliersTable.organizationId, organizationId));
      }

      await dbClient
        .delete(SuppliersTable)
        .where(and(...whereConditions));
      
      logger.info('✅ [SuppliersRepository.deleteSupplier] Supplier deleted successfully');
      return true;
    } catch (error) {
      logger.error('❌ [SuppliersRepository.deleteSupplier] Error:', error);
      throw error;
    }
  }
}
