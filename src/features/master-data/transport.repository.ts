/**
 * Transport Repository
 *
 * @description Data access layer for Transport operations.
 */

import { db } from '@/db';
import { TransportTable, TransportType, TransportInsertType } from './transport.model';
import { eq, and, like, notInArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';
import { TRANSPORT_CAPACITY_TEMPLATES } from './transport-capacity.util';

const SYSTEM_TEMPLATE_CODES = Object.keys(TRANSPORT_CAPACITY_TEMPLATES);

// ============================================
// FILTER TYPES
// ============================================

export type TransportFilter = {
  id?: string;
  code?: string;
  /** When true (default), hide system tonnage template rows (1T, 3T, …). */
  vehiclesOnly?: boolean;
};

export class TransportRepositoryClass {
  constructor() {}

  /**
   * Get transports with optional filtering and pagination
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters
   * @param organizationId - Organization ID for multi-tenant filtering
   * @returns Paginated transports
   */
  async getTransports(filter: TransportFilter, paginationParams: PaginationParams, organizationId?: string): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [TransportRepository.getTransports] Getting transports...');
      logger.debug('Filter:', filter);

      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(TransportTable.organizationId, organizationId));
      }

      if (filter.id) {
        whereCondition.push(eq(TransportTable.id, filter.id));
      }

      if (filter.code) {
        whereCondition.push(like(TransportTable.code, `%${filter.code}%`));
      }

      if (filter.vehiclesOnly !== false) {
        whereCondition.push(notInArray(TransportTable.code, SYSTEM_TEMPLATE_CODES));
      }

      const baseQuery = db
        .select({
          id: TransportTable.id,
          organizationId: TransportTable.organizationId,
          code: TransportTable.code,
          description: TransportTable.description,
          storageBinId: TransportTable.storageBinId,
          location: TransportTable.location,
          minLengthMm: TransportTable.minLengthMm,
          minWidthMm: TransportTable.minWidthMm,
          minHeightMm: TransportTable.minHeightMm,
          minWeightKg: TransportTable.minWeightKg,
          maxLengthMm: TransportTable.maxLengthMm,
          maxWidthMm: TransportTable.maxWidthMm,
          maxHeightMm: TransportTable.maxHeightMm,
          maxWeightKg: TransportTable.maxWeightKg,
          numberOfPallets: TransportTable.numberOfPallets,
          createdAt: TransportTable.createdAt,
          updatedAt: TransportTable.updatedAt,
          createdBy: TransportTable.createdBy,
          updatedBy: TransportTable.updatedBy,
        })
        .from(TransportTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [TransportRepository.getTransports] Transports fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [TransportRepository.getTransports] Error:', error);
      throw error;
    }
  }

  /**
   * Get transport by ID
   * @param id - Transport ID
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getTransportById(id: string, organizationId?: string): Promise<TransportType | null> {
    try {
      logger.info('ℹ️ [TransportRepository.getTransportById] Getting transport by ID...');
      const whereConditions = [eq(TransportTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(TransportTable.organizationId, organizationId));
      }
      const [record] = await db
        .select()
        .from(TransportTable)
        .where(and(...whereConditions))
        .limit(1);

      logger.info('✅ [TransportRepository.getTransportById] Transport fetched successfully');
      return record || null;
    } catch (error) {
      logger.error('❌ [TransportRepository.getTransportById] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new transport
   * @param data - Transport data
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Created transport
   */
  async createTransport(data: Omit<TransportInsertType, 'id' | 'createdAt' | 'updatedAt'> & { organizationId: string }, organizationId?: string, tx?: DbTransaction): Promise<TransportType> {
    try {
      logger.info('ℹ️ [TransportRepository.createTransport] Creating transport...');
      logger.debug('Data:', data);
      const dbClient = tx || db;
      const [newRecord] = await dbClient.insert(TransportTable).values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      logger.info('✅ [TransportRepository.createTransport] Transport created successfully');
      return newRecord || null;
    } catch (error) {
      logger.error('❌ [TransportRepository.createTransport] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing transport
   * @param data - Transport data
   * @param id - Transport ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Updated transport
   */
  async updateTransport(data: Partial<TransportInsertType>, id: string, organizationId?: string, tx?: DbTransaction): Promise<TransportType | null> {
    try {
      logger.info('ℹ️ [TransportRepository.updateTransport] Updating transport...');
      logger.debug('Data:', data);
      const dbClient = tx || db;
      const whereConditions = [eq(TransportTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(TransportTable.organizationId, organizationId));
      }
      const [updatedRecord] = await dbClient.update(TransportTable).set({ ...data, updatedAt: new Date() }).where(and(...whereConditions)).returning();
      logger.info('✅ [TransportRepository.updateTransport] Transport updated successfully');
      return updatedRecord || null;
    } catch (error) {
      logger.error('❌ [TransportRepository.updateTransport] Error:', error);
      throw error;
    }
  }

  /**
   * Delete an existing transport
   * @param id - Transport ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Deleted transport boolean
   */
  async deleteTransport(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      logger.info('ℹ️ [TransportRepository.deleteTransport] Deleting transport...');
      logger.debug('Transport ID:', id);
      const dbClient = tx || db;
      const whereConditions = [eq(TransportTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(TransportTable.organizationId, organizationId));
      }
      const result = await dbClient.delete(TransportTable).where(and(...whereConditions)).returning();
      logger.info('✅ [TransportRepository.deleteTransport] Transport deleted successfully');
      return result.length > 0 ? true : false;
    } catch (error) {
      logger.error('❌ [TransportRepository.deleteTransport] Error:', error);
      throw new Error('[TransportRepository.deleteTransport] Error deleting transport');
    }
  }
}
