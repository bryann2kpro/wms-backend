/**
 * Pallet Label Repository
 *
 * @description Data access layer for Pallet Label operations.
 */

import { db } from '@/db';
import { PalletLabelTable, PalletLabelType, PalletLabelInsertType } from './pallet-label.model';
import { eq, and, like } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

// ============================================
// FILTER TYPES
// ============================================

export type PalletLabelFilter = {
  id?: string;
  storageBinId?: string;
  labelCode?: string;
};

export class PalletLabelRepositoryClass {
  constructor() {}

  /**
   * Get pallet labels with optional filtering and pagination
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters
   * @param organizationId - Organization ID for multi-tenant filtering
   * @returns Paginated pallet labels
   */
  async getPalletLabels(filter: PalletLabelFilter, paginationParams: PaginationParams, organizationId?: string): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [PalletLabelRepository.getPalletLabels] Getting pallet labels...');
      logger.debug('Filter:', filter);

      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(PalletLabelTable.organizationId, organizationId));
      }

      if (filter.id) {
        whereCondition.push(eq(PalletLabelTable.id, filter.id));
      }

      if (filter.storageBinId) {
        whereCondition.push(eq(PalletLabelTable.storageBinId, filter.storageBinId));
      }

      if (filter.labelCode) {
        whereCondition.push(like(PalletLabelTable.labelCode, `%${filter.labelCode}%`));
      }

      const baseQuery = db
        .select({
          id: PalletLabelTable.id,
          storageBinId: PalletLabelTable.storageBinId,
          labelCode: PalletLabelTable.labelCode,
          description: PalletLabelTable.description,
          isActive: PalletLabelTable.isActive,
          createdAt: PalletLabelTable.createdAt,
          updatedAt: PalletLabelTable.updatedAt,
          createdBy: PalletLabelTable.createdBy,
          updatedBy: PalletLabelTable.updatedBy,
        })
        .from(PalletLabelTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [PalletLabelRepository.getPalletLabels] Pallet labels fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [PalletLabelRepository.getPalletLabels] Error:', error);
      throw error;
    }
  }

  /**
   * Get pallet label by ID
   * @param id - Pallet Label ID
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getPalletLabelById(id: string, organizationId?: string): Promise<PalletLabelType | null> {
    try {
      logger.info('ℹ️ [PalletLabelRepository.getPalletLabelById] Getting pallet label by ID...');
      const whereConditions = [eq(PalletLabelTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(PalletLabelTable.organizationId, organizationId));
      }
      const [label] = await db
        .select()
        .from(PalletLabelTable)
        .where(and(...whereConditions))
        .limit(1);

      logger.info('✅ [PalletLabelRepository.getPalletLabelById] Pallet label fetched successfully');
      return label || null;
    } catch (error) {
      logger.error('❌ [PalletLabelRepository.getPalletLabelById] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new pallet label
   * @param data - Pallet label data
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Created pallet label
   */
  async createPalletLabel(data: Omit<PalletLabelInsertType, 'id' | 'createdAt' | 'updatedAt'> & { organizationId: string }, organizationId?: string, tx?: DbTransaction): Promise<PalletLabelType> {
    try {
      logger.info('ℹ️ [PalletLabelRepository.createPalletLabel] Creating pallet label...');
      logger.debug('Data:', data);
      const dbClient = tx || db;
      const [newLabel] = await dbClient.insert(PalletLabelTable).values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      logger.info('✅ [PalletLabelRepository.createPalletLabel] Pallet label created successfully');
      return newLabel || null;
    } catch (error) {
      logger.error('❌ [PalletLabelRepository.createPalletLabel] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing pallet label
   * @param data - Pallet label data
   * @param id - Pallet Label ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Updated pallet label
   */
  async updatePalletLabel(data: Partial<PalletLabelInsertType>, id: string, organizationId?: string, tx?: DbTransaction): Promise<PalletLabelType | null> {
    try {
      logger.info('ℹ️ [PalletLabelRepository.updatePalletLabel] Updating pallet label...');
      logger.debug('Data:', data);
      const dbClient = tx || db;
      const whereConditions = [eq(PalletLabelTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(PalletLabelTable.organizationId, organizationId));
      }
      const [updatedLabel] = await dbClient.update(PalletLabelTable).set({ ...data, updatedAt: new Date() }).where(and(...whereConditions)).returning();
      logger.info('✅ [PalletLabelRepository.updatePalletLabel] Pallet label updated successfully');
      return updatedLabel || null;
    } catch (error) {
      logger.error('❌ [PalletLabelRepository.updatePalletLabel] Error:', error);
      throw error;
    }
  }

  /**
   * Delete an existing pallet label
   * @param id - Pallet Label ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Deleted pallet label boolean
   */
  async deletePalletLabel(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      logger.info('ℹ️ [PalletLabelRepository.deletePalletLabel] Deleting pallet label...');
      logger.debug('Pallet Label ID:', id);
      const dbClient = tx || db;
      const whereConditions = [eq(PalletLabelTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(PalletLabelTable.organizationId, organizationId));
      }
      const result = await dbClient.delete(PalletLabelTable).where(and(...whereConditions)).returning();
      logger.info('✅ [PalletLabelRepository.deletePalletLabel] Pallet label deleted successfully');
      return result.length > 0 ? true : false;
    } catch (error) {
      logger.error('❌ [PalletLabelRepository.deletePalletLabel] Error:', error);
      throw new Error('[PalletLabelRepository.deletePalletLabel] Error deleting pallet label');
    }
  }
}
