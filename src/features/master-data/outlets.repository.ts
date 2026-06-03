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

// ============================================
// FILTER TYPES
// ============================================

export type OutletFilter = {
  outletId?: string | string[];
  outletCode?: string | string[];
  outletName?: string;
  regionId?: string | string[] | null; // null = unassigned outlets
};

export type OutletWithRegion = OutletType & {
  regionName: string | null;
  regionCode: string | null;
  address?: string | null;
};

export class OutletsRepositoryClass {
  constructor() {}

  /**
   * Get outlets with optional filtering and pagination
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters
   * @returns Paginated outlets with region info
   */
  async getOutlet(filter: OutletFilter, paginationParams: PaginationParams, organizationId?: string): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [OutletsRepository.getOutlet] Getting outlets...');
      logger.debug('Filter:', filter);

      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(OutletsTable.organizationId, organizationId));
      }

      if (Array.isArray(filter.outletId)) {
        whereCondition.push(inArray(OutletsTable.outletId, filter.outletId));
      } else if (filter.outletId) {
        whereCondition.push(eq(OutletsTable.outletId, filter.outletId));
      }

      if (Array.isArray(filter.outletCode)) {
        whereCondition.push(inArray(OutletsTable.outletCode, filter.outletCode));
      } else if (filter.outletCode) {
        whereCondition.push(eq(OutletsTable.outletCode, filter.outletCode));
      }

      if (filter.outletName) {
        whereCondition.push(like(OutletsTable.outletName, `%${filter.outletName}%`));
      }

      // Handle regionId filter - null means unassigned
      if (filter.regionId === null) {
        whereCondition.push(isNull(OutletsTable.regionId));
      } else if (Array.isArray(filter.regionId)) {
        whereCondition.push(inArray(OutletsTable.regionId, filter.regionId));
      } else if (filter.regionId) {
        whereCondition.push(eq(OutletsTable.regionId, filter.regionId));
      }

      const baseQuery = db
        .select({
          outletId: OutletsTable.outletId,
          organizationId: OutletsTable.organizationId,
          outletName: OutletsTable.outletName,
          outletCode: OutletsTable.outletCode,
          address: OutletsTable.address,
          chain: OutletsTable.chain,
          channel: OutletsTable.channel,
          debtor: OutletsTable.debtor,
          regionId: OutletsTable.regionId,
          createdAt: OutletsTable.createdAt,
          updatedAt: OutletsTable.updatedAt,
          createdBy: OutletsTable.createdBy,
          updatedBy: OutletsTable.updatedBy,
          regionName: RegionTable.regionName,
          regionCode: RegionTable.regionCode,
        })
        .from(OutletsTable)
        .leftJoin(RegionTable, eq(OutletsTable.regionId, RegionTable.regionId))
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [OutletsRepository.getOutlet] Outlets fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [OutletsRepository.getOutlet] Error:', error);
      throw error;
    }
  }

  /**
   * Get outlet by ID
   */
  async getOutletById(id: string, organizationId?: string): Promise<OutletWithRegion | null> {
    try {
      logger.info('ℹ️ [OutletsRepository.getOutletById] Getting outlet by ID...');
      const whereConditions = [eq(OutletsTable.outletId, id)];
      if (organizationId) {
        whereConditions.push(eq(OutletsTable.organizationId, organizationId));
      }
      const [outlet] = await db
        .select({
          outletId: OutletsTable.outletId,
          organizationId: OutletsTable.organizationId,
          outletName: OutletsTable.outletName,
          outletCode: OutletsTable.outletCode,
          address: OutletsTable.address,
          chain: OutletsTable.chain,
          channel: OutletsTable.channel,
          debtor: OutletsTable.debtor,
          regionId: OutletsTable.regionId,
          createdAt: OutletsTable.createdAt,
          updatedAt: OutletsTable.updatedAt,
          createdBy: OutletsTable.createdBy,
          updatedBy: OutletsTable.updatedBy,
          regionName: RegionTable.regionName,
          regionCode: RegionTable.regionCode,
        })
        .from(OutletsTable)
        .leftJoin(RegionTable, eq(OutletsTable.regionId, RegionTable.regionId))
        .where(and(...whereConditions))
        .limit(1);
      
      logger.info('✅ [OutletsRepository.getOutletById] Outlet fetched successfully');
      return outlet || null;
    } catch (error) {
      logger.error('❌ [OutletsRepository.getOutletById] Error:', error);
      throw error;
    }
  }

  /**
   * Get outlet by code
   */
  async getOutletByCode(code: string, organizationId?: string): Promise<OutletWithRegion | null> {
    try {
      logger.info('ℹ️ [OutletsRepository.getOutletByCode] Getting outlet by code...');
      const whereConditions = [eq(OutletsTable.outletCode, code)];
      if (organizationId) {
        whereConditions.push(eq(OutletsTable.organizationId, organizationId));
      }
      const [outlet] = await db
        .select({
          outletId: OutletsTable.outletId,
          organizationId: OutletsTable.organizationId,
          outletName: OutletsTable.outletName,
          outletCode: OutletsTable.outletCode,
          address: OutletsTable.address,
          chain: OutletsTable.chain,
          channel: OutletsTable.channel,
          debtor: OutletsTable.debtor,
          regionId: OutletsTable.regionId,
          createdAt: OutletsTable.createdAt,
          updatedAt: OutletsTable.updatedAt,
          createdBy: OutletsTable.createdBy,
          updatedBy: OutletsTable.updatedBy,
          regionName: RegionTable.regionName,
          regionCode: RegionTable.regionCode,
        })
        .from(OutletsTable)
        .leftJoin(RegionTable, eq(OutletsTable.regionId, RegionTable.regionId))
        .where(and(...whereConditions))
        .limit(1);
      
      logger.info('✅ [OutletsRepository.getOutletByCode] Outlet fetched successfully');
      return outlet || null;
    } catch (error) {
      logger.error('❌ [OutletsRepository.getOutletByCode] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new outlet
   * @param data - Outlet data
   * @param tx - Optional transaction
   */
  async createOutlet(data: Omit<OutletInsertType, 'outletId' | 'createdAt' | 'updatedAt'> & { organizationId: string }, tx?: DbTransaction): Promise<OutletType> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [OutletsRepository.createOutlet] Creating outlet...');

      const [outlet] = await dbClient
        .insert(OutletsTable)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      logger.info('✅ [OutletsRepository.createOutlet] Outlet created successfully');
      return outlet;
    } catch (error) {
      logger.error('❌ [OutletsRepository.createOutlet] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing outlet
   * @param data - Partial outlet data
   * @param id - Outlet ID
   * @param tx - Optional transaction
   */
  async updateOutlet(data: Partial<OutletInsertType>, id: string, tx?: DbTransaction): Promise<OutletType> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [OutletsRepository.updateOutlet] Updating outlet...');
      
      const [outlet] = await dbClient
        .update(OutletsTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(OutletsTable.outletId, id))
        .returning();
      
      logger.info('✅ [OutletsRepository.updateOutlet] Outlet updated successfully');
      return outlet;
    } catch (error) {
      logger.error('❌ [OutletsRepository.updateOutlet] Error:', error);
      throw error;
    }
  }

  /**
   * Assign outlet to region
   * @param outletId - Outlet ID
   * @param regionId - Region ID (or null to unassign)
   * @param updatedBy - User who made the update
   * @param tx - Optional transaction
   */
  async assignOutletToRegion(outletId: string, regionId: string | null, updatedBy: string, organizationId?: string, tx?: DbTransaction): Promise<OutletType> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [OutletsRepository.assignOutletToRegion] Assigning outlet to region...');
      const whereConditions = [eq(OutletsTable.outletId, outletId)];
      if (organizationId) {
        whereConditions.push(eq(OutletsTable.organizationId, organizationId));
      }

      const [outlet] = await dbClient
        .update(OutletsTable)
        .set({ regionId, updatedAt: new Date(), updatedBy })
        .where(and(...whereConditions))
        .returning();
      
      logger.info('✅ [OutletsRepository.assignOutletToRegion] Outlet assigned successfully');
      return outlet;
    } catch (error) {
      logger.error('❌ [OutletsRepository.assignOutletToRegion] Error:', error);
      throw error;
    }
  }

  /**
   * Bulk assign outlets to region
   * @param outletIds - Array of outlet IDs
   * @param regionId - Region ID (or null to unassign)
   * @param updatedBy - User who made the update
   * @param tx - Optional transaction
   */
  async bulkAssignOutletsToRegion(outletIds: string[], regionId: string | null, updatedBy: string, organizationId?: string, tx?: DbTransaction): Promise<OutletType[]> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [OutletsRepository.bulkAssignOutletsToRegion] Bulk assigning outlets to region...');
      const whereConditions = [inArray(OutletsTable.outletId, outletIds)];
      if (organizationId) {
        whereConditions.push(eq(OutletsTable.organizationId, organizationId));
      }

      const outlets = await dbClient
        .update(OutletsTable)
        .set({ regionId, updatedAt: new Date(), updatedBy })
        .where(and(...whereConditions))
        .returning();
      
      logger.info('✅ [OutletsRepository.bulkAssignOutletsToRegion] Outlets assigned successfully');
      return outlets;
    } catch (error) {
      logger.error('❌ [OutletsRepository.bulkAssignOutletsToRegion] Error:', error);
      throw error;
    }
  }

  /**
   * Delete an outlet
   * @param id - Outlet ID
   * @param organizationId - Organization ID (for multi-tenant filtering)
   * @param tx - Optional transaction
   */
  async deleteOutlet(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [OutletsRepository.deleteOutlet] Deleting outlet...');
      const whereConditions = [eq(OutletsTable.outletId, id)];
      if (organizationId) {
        whereConditions.push(eq(OutletsTable.organizationId, organizationId));
      }

      await dbClient
        .delete(OutletsTable)
        .where(and(...whereConditions));
      
      logger.info('✅ [OutletsRepository.deleteOutlet] Outlet deleted successfully');
      return true;
    } catch (error) {
      logger.error('❌ [OutletsRepository.deleteOutlet] Error:', error);
      throw error;
    }
  }
}
