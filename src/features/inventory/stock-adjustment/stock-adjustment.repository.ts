/**
 * Stock Adjustment Repository
 *
 * @description Data access layer for Stock Adjustment operations.
 */

import { db } from '@/db';
import {
  StockAdjustmentsTable,
  StockAdjustmentInsertType,
  StockAdjustmentType,
  StockAdjustmentItemsTable,
  StockAdjustmentItemInsertType,
  StockAdjustmentItemType,
} from './stock-adjustment.model';
import { eq, and, ilike, desc, asc } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';
import { pagination, PgQueryType } from '@/util/pagination';
import type { DbTransaction } from '@/types/db-transaction';
import { RunningNoRepositoryClass } from '@/features/running-no/running-no.repository';

// ============================================
// FILTER TYPES
// ============================================

export type StockAdjustmentFilter = {
  id?: string;
  adjustmentNo?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
};

export class StockAdjustmentRepositoryClass {
  constructor(
    private readonly runningNoRepository: RunningNoRepositoryClass,
  ) {}

  // ============================================
  // HEADER OPERATIONS
  // ============================================

  async getStockAdjustments(
    filter: StockAdjustmentFilter,
    paginationParams?: PaginationParams,
    organizationId?: string,
  ): Promise<PaginatedResponse<any> | false> {
    try {
      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(StockAdjustmentsTable.organizationId, organizationId));
      }
      if (filter.id) {
        whereCondition.push(eq(StockAdjustmentsTable.id, filter.id));
      }
      if (filter.search) {
        const term = `%${filter.search.trim()}%`;
        whereCondition.push(ilike(StockAdjustmentsTable.adjustmentNo, term));
      } else if (filter.adjustmentNo) {
        whereCondition.push(ilike(StockAdjustmentsTable.adjustmentNo, `%${filter.adjustmentNo}%`));
      }

      const sortOrder = filter.sortOrder?.toUpperCase() === 'ASC' ? asc : desc;
      const sortBy = (filter.sortBy?.toUpperCase() ?? 'CREATED_AT') as string;
      const orderByColumn =
        sortBy === 'ADJUSTMENT_NO' ? StockAdjustmentsTable.adjustmentNo
        : sortBy === 'UPDATED_AT' ? StockAdjustmentsTable.updatedAt
        : StockAdjustmentsTable.createdAt;

      const baseQuery = db
        .select()
        .from(StockAdjustmentsTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)
        .orderBy(sortOrder(orderByColumn));

      if (!paginationParams || (!paginationParams.pageSize && !paginationParams.pageNumber)) {
        const data = await baseQuery;
        const totalCount = data.length;
        logger.info('✅ [StockAdjustmentRepository.getStockAdjustments] Fetched successfully (no pagination)');
        return {
          query: data,
          pagination: {
            count: totalCount,
            totalCount,
            currentPage: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false,
          },
        };
      }

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [StockAdjustmentRepository.getStockAdjustments] Fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [StockAdjustmentRepository.getStockAdjustments] Error:', error);
      return false;
    }
  }

  async getStockAdjustmentById(id: string, tx?: DbTransaction): Promise<StockAdjustmentType | null> {
    try {
      const client = tx ?? db;
      const [adjustment] = await client
        .select()
        .from(StockAdjustmentsTable)
        .where(eq(StockAdjustmentsTable.id, id));

      return adjustment ?? null;
    } catch (error) {
      logger.error('❌ [StockAdjustmentRepository.getStockAdjustmentById] Error:', error);
      throw error;
    }
  }

  async createStockAdjustment(
    data: Omit<StockAdjustmentInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<StockAdjustmentType> {
    try {
      const client = tx ?? db;
      const [adjustment] = await client.insert(StockAdjustmentsTable).values(data).returning();

      logger.info('✅ [StockAdjustmentRepository.createStockAdjustment] Created successfully');
      return adjustment;
    } catch (error) {
      logger.error('❌ [StockAdjustmentRepository.createStockAdjustment] Error:', error);
      throw error;
    }
  }

  // ============================================
  // ITEM OPERATIONS
  // ============================================

  async getStockAdjustmentItems(stockAdjustmentId: string, tx?: DbTransaction): Promise<StockAdjustmentItemType[]> {
    try {
      const client = tx ?? db;
      const items = await client
        .select()
        .from(StockAdjustmentItemsTable)
        .where(eq(StockAdjustmentItemsTable.stockAdjustmentId, stockAdjustmentId));

      return items;
    } catch (error) {
      logger.error('❌ [StockAdjustmentRepository.getStockAdjustmentItems] Error:', error);
      throw error;
    }
  }

  async createStockAdjustmentItems(
    items: StockAdjustmentItemInsertType[],
    tx?: DbTransaction,
  ): Promise<StockAdjustmentItemType[]> {
    if (items.length === 0) return [];
    try {
      const client = tx ?? db;
      const inserted = await client.insert(StockAdjustmentItemsTable).values(items).returning();

      logger.info('✅ [StockAdjustmentRepository.createStockAdjustmentItems] Created successfully', { count: inserted.length });
      return inserted;
    } catch (error) {
      logger.error('❌ [StockAdjustmentRepository.createStockAdjustmentItems] Error:', error);
      throw error;
    }
  }

  // ============================================
  // RUNNING NUMBER
  // ============================================

  async generateAdjustmentNo(tx?: DbTransaction): Promise<string> {
    const run = async (dbClient: typeof db | DbTransaction) => {
      return this.runningNoRepository.generateRunningNo(
        { scope: 'stock-adjustment', prefix: 'ADJ', width: 4 },
        dbClient,
      );
    };
    if (tx) return run(tx);
    return db.transaction(async (dbTx) => run(dbTx));
  }
}
