/**
 * Outlets Repository
 * 
 * @description Data access layer for Outlet operations.
 */

import { db } from '@/db';
import { OutletsTable, OutletType, OutletInsertType } from './outlets.model';
import { RegionTable } from './region.model';
import { eq, and, like, inArray, or, ilike, asc, sql } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';
import { RackInsertType, RacksTable, RackType } from './racks.model';
import { ZonesTable } from './zone.model';

// ============================================
// FILTER TYPES
// ============================================

export type RackFilter = {
  rackId?: string | string[];
  warehouseId?: string;
  rackName?: string;
  rackRow?: string | string[];
  rackColumn?: string | string[];
  rackLevel?: string | string[];
  binCode?: string;
  binType?: string;
  isActive?: boolean;
  /** Partial match on row, level, column, bin code, or `row-level-column` label. */
  search?: string;
};

export class RacksRepositoryClass {
  constructor() {}

  /**
   * Get racks with optional filtering and pagination
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters
   * @param organizationId - Organization ID for multi-tenant filtering
   * @returns Paginated racks with region info
   */
  async getRack(filter: RackFilter, paginationParams: PaginationParams, organizationId?: string): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [RacksRepository.getRack] Getting racks...');
      logger.debug('Filter:', filter);

      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(RacksTable.organizationId, organizationId));
      }

      if (Array.isArray(filter.rackId)) {
        whereCondition.push(inArray(RacksTable.rackId, filter.rackId));
      } else if (filter.rackId) {
        whereCondition.push(eq(RacksTable.rackId, filter.rackId));
      }

      if (filter.warehouseId) {
        // Racks may link to a warehouse directly or via their zone.
        whereCondition.push(
          or(
            eq(RacksTable.warehouseId, filter.warehouseId),
            eq(ZonesTable.warehouseId, filter.warehouseId),
          )!,
        );
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

      if (filter.binCode) {
        whereCondition.push(like(RacksTable.binCode, `%${filter.binCode}%`));
      }

      if (filter.binType) {
        whereCondition.push(eq(RacksTable.binType, filter.binType));
      }

      if (filter.isActive !== undefined) {
        whereCondition.push(eq(RacksTable.isActive, filter.isActive));
      }

      const searchTerm = filter.search?.trim();
      if (searchTerm) {
        const pattern = `%${searchTerm}%`;
        whereCondition.push(
          or(
            ilike(RacksTable.rackRow, pattern),
            ilike(RacksTable.rackColumn, pattern),
            ilike(RacksTable.rackLevel, pattern),
            ilike(RacksTable.binCode, pattern),
            sql`(${RacksTable.rackRow} || '-' || ${RacksTable.rackLevel} || '-' || ${RacksTable.rackColumn}) ilike ${pattern}`,
          )!,
        );
      }

      const baseQuery = db
        .select({
          rackId: RacksTable.rackId,
          warehouseId: sql<string | null>`COALESCE(${RacksTable.warehouseId}, ${ZonesTable.warehouseId})`.as('warehouse_id'),
          zoneId: RacksTable.zoneId,
          areaId: RacksTable.areaId,
          rackRow: RacksTable.rackRow,
          rackColumn: RacksTable.rackColumn,
          rackLevel: RacksTable.rackLevel,
          binCode: RacksTable.binCode,
          barCode: RacksTable.barCode,
          binType: RacksTable.binType,
          length: RacksTable.length,
          width: RacksTable.width,
          height: RacksTable.height,
          weight: RacksTable.weight,
          maxPallet: RacksTable.maxPallet,
          isActive: RacksTable.isActive,
          createdAt: RacksTable.createdAt,
          updatedAt: RacksTable.updatedAt,
          createdBy: RacksTable.createdBy,
          updatedBy: RacksTable.updatedBy,
        })
        .from(RacksTable)
        .leftJoin(ZonesTable, eq(RacksTable.zoneId, ZonesTable.zoneId))
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)
        .orderBy(
          asc(RacksTable.rackRow),
          asc(RacksTable.rackLevel),
          asc(RacksTable.rackColumn),
        );

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
   * Get rack by ID
   * @param id - Rack ID
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getRackById(id: string, organizationId?: string): Promise<RackType | null> {
    try {
      logger.info('ℹ️ [RacksRepository.getRackById] Getting rack by ID...');
      const whereConditions = [eq(RacksTable.rackId, id)];
      if (organizationId) {
        whereConditions.push(eq(RacksTable.organizationId, organizationId));
      }
      const [rack] = await db
        .select()
        .from(RacksTable)
        .where(and(...whereConditions))
        .limit(1);

      logger.info('✅ [RacksRepository.getRackById] Rack fetched successfully');
      return rack || null;
    } catch (error) {
      logger.error('❌ [RacksRepository.getRackById] Error:', error);
      throw error;
    }
  }

  /**
   * Active racks with location + dimensions in one query (putaway suggestion).
   * Avoids paginated getRack double-fetch when scanning all bins for capacity.
   */
  async listActiveRacksForPutaway(
    organizationId: string,
    tx?: DbTransaction,
  ): Promise<Array<{
    rackId: string;
    rackRow: string;
    rackColumn: string;
    rackLevel: string;
    length: string | null;
    width: string | null;
    height: string | null;
    weight: string | null;
  }>> {
    const client = tx ?? db;
    return client
      .select({
        rackId: RacksTable.rackId,
        rackRow: RacksTable.rackRow,
        rackColumn: RacksTable.rackColumn,
        rackLevel: RacksTable.rackLevel,
        length: RacksTable.length,
        width: RacksTable.width,
        height: RacksTable.height,
        weight: RacksTable.weight,
      })
      .from(RacksTable)
      .where(
        and(
          eq(RacksTable.organizationId, organizationId),
          eq(RacksTable.isActive, true),
        ),
      )
      .orderBy(
        asc(RacksTable.rackRow),
        asc(RacksTable.rackLevel),
        asc(RacksTable.rackColumn),
      );
  }

  /**
   * Get rack dimensions (length/width/height/weight) for all racks in an organization
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getAllRackDimensions(organizationId?: string): Promise<Array<{
    rackId: string;
    length: string | null;
    width: string | null;
    height: string | null;
    weight: string | null;
  }>> {
    try {
      logger.info('ℹ️ [RacksRepository.getAllRackDimensions] Getting rack dimensions...');
      const whereCondition = [];
      if (organizationId) {
        whereCondition.push(eq(RacksTable.organizationId, organizationId));
      }
      const rows = await db
        .select({
          rackId: RacksTable.rackId,
          length: RacksTable.length,
          width: RacksTable.width,
          height: RacksTable.height,
          weight: RacksTable.weight,
        })
        .from(RacksTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      logger.info('✅ [RacksRepository.getAllRackDimensions] Rack dimensions fetched successfully');
      return rows;
    } catch (error) {
      logger.error('❌ [RacksRepository.getAllRackDimensions] Error:', error);
      throw error;
    }
  }

  /**
   * Resolve the warehouse for a set of racks via m_racks → m_zones.
   * A rack with no zone (zoneId NULL) resolves to a null warehouse — every
   * requested rackId is present in the returned map.
   * @param rackIds - Rack IDs to resolve
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Map of rackId → warehouseId (null when unzoned)
   */
  async getRackWarehouseIds(rackIds: string[], organizationId: string, tx?: DbTransaction): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    if (rackIds.length === 0) return result;
    try {
      const dbClient = tx || db;
      // Warehouse is resolved from the direct rack column or via zone.
      const rows = await dbClient
        .select({
          rackId: RacksTable.rackId,
          warehouseId: sql<string | null>`COALESCE(${RacksTable.warehouseId}, ${ZonesTable.warehouseId})`.as('warehouse_id'),
        })
        .from(RacksTable)
        .leftJoin(ZonesTable, eq(RacksTable.zoneId, ZonesTable.zoneId))
        .where(and(eq(RacksTable.organizationId, organizationId), inArray(RacksTable.rackId, rackIds)));

      for (const row of rows) {
        result.set(row.rackId, row.warehouseId ?? null);
      }
      return result;
    } catch (error) {
      logger.error('❌ [RacksRepository.getRackWarehouseIds] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new rack
   * @param rack - Rack data
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Created rack
   */
  async createRack(rack: Omit<RackInsertType, 'rackId' | 'createdAt' | 'updatedAt'> & { organizationId: string }, organizationId?: string, tx?: DbTransaction): Promise<RackType> {
    try {
      logger.info('ℹ️ [RacksRepository.createRack] Creating rack...');
      logger.debug('Rack:', rack);
      const dbClient = tx || db;
      const [newRack] = await dbClient.insert(RacksTable).values({
        ...rack,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
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
   * @param id - Rack ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Updated rack
   */
  async updateRack(rack: Partial<RackInsertType>, id: string, organizationId?: string, tx?: DbTransaction): Promise<RackType | null> {
    try {
      logger.info('ℹ️ [RacksRepository.updateRack] Updating rack...');
      logger.debug('Rack:', rack);
      const dbClient = tx || db;
      const whereConditions = [eq(RacksTable.rackId, id)];
      if (organizationId) {
        whereConditions.push(eq(RacksTable.organizationId, organizationId));
      }
      const [updatedRack] = await dbClient.update(RacksTable).set({ ...rack, updatedAt: new Date() }).where(and(...whereConditions)).returning();
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
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   * @returns Deleted rack boolean
   */
  async deleteRack(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      logger.info('ℹ️ [RacksRepository.deleteRack] Deleting rack...');
      logger.debug('Rack ID:', id);
      const dbClient = tx || db;
      const whereConditions = [eq(RacksTable.rackId, id)];
      if (organizationId) {
        whereConditions.push(eq(RacksTable.organizationId, organizationId));
      }
      const result = await dbClient.delete(RacksTable).where(and(...whereConditions)).returning();
      logger.info('✅ [RacksRepository.deleteRack] Rack deleted successfully');
      return result.length > 0 ? true : false;
    } catch (error) {
      logger.error('❌ [RacksRepository.deleteRack] Error:', error);
      throw new Error('[RacksRepository.deleteRack] Error deleting rack');
    }
  }
}
