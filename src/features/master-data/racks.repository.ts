/**
 * Outlets Repository
 * 
 * @description Data access layer for Outlet operations.
 */

import { db } from '@/db';
import { OutletsTable, OutletType, OutletInsertType } from './outlets.model';
import { RegionTable } from './region.model';
import { eq, and, like, inArray, isNull } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';
import { RackInsertType, RacksTable, RackType } from './racks.model';

// ============================================
// FILTER TYPES
// ============================================

export type RackFilter = {
  rackId?: string | string[];
  rackName?: string;
  rackRow?: string | string[];
  rackColumn?: string | string[];
  rackLevel?: string | string[];
};

export class RacksRepositoryClass {
  constructor() {}

  /**
   * Get racks with optional filtering and pagination
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters
   * @returns Paginated racks with region info
   */
  async getRack(filter: RackFilter, paginationParams: PaginationParams): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [RacksRepository.getRack] Getting racks...');
      logger.debug('Filter:', filter);

      const whereCondition = [];

      if (Array.isArray(filter.rackId)) {
        whereCondition.push(inArray(RacksTable.rackId, filter.rackId));
      } else if (filter.rackId) {
        whereCondition.push(eq(RacksTable.rackId, filter.rackId));
      }

      if (Array.isArray(filter.rackRow)) {
        whereCondition.push(inArray(RacksTable.rackRow, filter.rackRow));
      } else if (filter.rackRow) {
        whereCondition.push(eq(RacksTable.rackRow, filter.rackRow));
      }

      if (filter.rackColumn) {
        whereCondition.push(like(RacksTable.rackColumn, `%${filter.rackColumn}%`));
      }

      if (filter.rackLevel) {
        whereCondition.push(like(RacksTable.rackLevel, `%${filter.rackLevel}%`));
      }

      const baseQuery = db
        .select({
          rackId: RacksTable.rackId,
          rackRow: RacksTable.rackRow,
          rackColumn: RacksTable.rackColumn,
          rackLevel: RacksTable.rackLevel,
          createdAt: RacksTable.createdAt,
          updatedAt: RacksTable.updatedAt,
          createdBy: RacksTable.createdBy,
          updatedBy: RacksTable.updatedBy,
        })
        .from(RacksTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [RacksRepository.getRack] Racks fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [RacksRepository.getRack] Error:', error);
      throw error;
    }
  }

  /**
   * Get outlet by ID
   */
  async getRackById(id: string): Promise<RackType | null> {
    try {
      logger.info('ℹ️ [RacksRepository.getRackById] Getting rack by ID...');
      const [rack] = await db
        .select()
        .from(RacksTable)
        .where(eq(RacksTable.rackId, id))
        .limit(1);
      
      logger.info('✅ [RacksRepository.getRackById] Rack fetched successfully');
      return rack || null;
    } catch (error) {
      logger.error('❌ [RacksRepository.getRackById] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new rack
   * @param rack - Rack data
   * @returns Created rack
   */
  async createRack(rack: RackInsertType): Promise<RackType> {
    try {
      logger.info('ℹ️ [RacksRepository.createRack] Creating rack...');
      logger.debug('Rack:', rack);
      const [newRack] = await db.insert(RacksTable).values(rack).returning();
      logger.info('✅ [RacksRepository.createRack] Rack created successfully');
      return newRack || null;
    } catch (error) {
      logger.error('❌ [RacksRepository.createRack] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing rack
   * @param rack - Rack data
   * @returns Updated rack
   */
  async updateRack(rack: Partial<RackInsertType>, id: string): Promise<RackType | null> {
    try {
      logger.info('ℹ️ [RacksRepository.updateRack] Updating rack...');
      logger.debug('Rack:', rack);
      const [updatedRack] = await db.update(RacksTable).set(rack).where(eq(RacksTable.rackId, id)).returning();
      logger.info('✅ [RacksRepository.updateRack] Rack updated successfully');
      return updatedRack || null;
    } catch (error) {
      logger.error('❌ [RacksRepository.updateRack] Error:', error);
      throw error;
    }
  }

  /**
   * Delete an existing rack
   * @param id - Rack ID
   * @returns Deleted rack boolean
   */
  async deleteRack(id: string): Promise<boolean> {
    try {
      logger.info('ℹ️ [RacksRepository.deleteRack] Deleting rack...');
      logger.debug('Rack ID:', id);
      const result = await db.delete(RacksTable).where(eq(RacksTable.rackId, id)).returning();
      logger.info('✅ [RacksRepository.deleteRack] Rack deleted successfully');
      return result.length > 0 ? true : false;
    } catch (error) {
      logger.error('❌ [RacksRepository.deleteRack] Error:', error);
      throw new Error('[RacksRepository.deleteRack] Error deleting rack');
    }
  }
}
