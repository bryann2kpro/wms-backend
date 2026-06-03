import { db } from '@/db';
import { ZoneInsertType, ZonesTable, ZoneType } from './zone.model';
import { WarehousesTable } from './warehouses.model';
import { eq, and, like, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

export type ZoneFilter = {
  zoneId?: string | string[];
  warehouseId?: string;
  purpose?: string;
  zoneName?: string;
};

export class ZoneRepositoryClass {
  constructor() {}

  async getZones(filter: ZoneFilter, paginationParams: PaginationParams): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [ZoneRepository.getZones] Getting zones...');

      const whereCondition = [];

      if (Array.isArray(filter.zoneId)) {
        whereCondition.push(inArray(ZonesTable.zoneId, filter.zoneId));
      } else if (filter.zoneId) {
        whereCondition.push(eq(ZonesTable.zoneId, filter.zoneId));
      }

      if (filter.warehouseId) {
        whereCondition.push(eq(ZonesTable.warehouseId, filter.warehouseId));
      }

      if (filter.purpose) {
        whereCondition.push(eq(ZonesTable.purpose, filter.purpose as any));
      }

      if (filter.zoneName) {
        whereCondition.push(like(ZonesTable.zoneName, `%${filter.zoneName}%`));
      }

      const baseQuery = db
        .select({
          zoneId: ZonesTable.zoneId,
          warehouseId: ZonesTable.warehouseId,
          zoneCode: ZonesTable.zoneCode,
          zoneName: ZonesTable.zoneName,
          purpose: ZonesTable.purpose,
          createdAt: ZonesTable.createdAt,
          updatedAt: ZonesTable.updatedAt,
          createdBy: ZonesTable.createdBy,
          updatedBy: ZonesTable.updatedBy,
          warehouseName: WarehousesTable.warehouseName,
        })
        .from(ZonesTable)
        .leftJoin(WarehousesTable, eq(ZonesTable.warehouseId, WarehousesTable.warehouseId))
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [ZoneRepository.getZones] Zones fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [ZoneRepository.getZones] Error:', error);
      throw error;
    }
  }

  async getZoneById(id: string): Promise<ZoneType | null> {
    try {
      logger.info('ℹ️ [ZoneRepository.getZoneById] Getting zone by ID...');
      const [zone] = await db
        .select()
        .from(ZonesTable)
        .where(eq(ZonesTable.zoneId, id))
        .limit(1);
      logger.info('✅ [ZoneRepository.getZoneById] Zone fetched successfully');
      return zone || null;
    } catch (error) {
      logger.error('❌ [ZoneRepository.getZoneById] Error:', error);
      throw error;
    }
  }

  async createZone(zone: Omit<ZoneInsertType, 'zoneId' | 'createdAt' | 'updatedAt'>, tx?: DbTransaction): Promise<ZoneType> {
    try {
      logger.info('ℹ️ [ZoneRepository.createZone] Creating zone...');
      const dbClient = tx || db;
      const [newZone] = await dbClient.insert(ZonesTable).values({
        ...zone,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      logger.info('✅ [ZoneRepository.createZone] Zone created successfully');
      return newZone;
    } catch (error) {
      logger.error('❌ [ZoneRepository.createZone] Error:', error);
      throw error;
    }
  }

  async updateZone(id: string, zone: Partial<ZoneInsertType>, tx?: DbTransaction): Promise<ZoneType | null> {
    try {
      logger.info('ℹ️ [ZoneRepository.updateZone] Updating zone...');
      const dbClient = tx || db;
      const [updated] = await dbClient.update(ZonesTable)
        .set({ ...zone, updatedAt: new Date() })
        .where(eq(ZonesTable.zoneId, id))
        .returning();
      logger.info('✅ [ZoneRepository.updateZone] Zone updated successfully');
      return updated || null;
    } catch (error) {
      logger.error('❌ [ZoneRepository.updateZone] Error:', error);
      throw error;
    }
  }

  async deleteZone(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      logger.info('ℹ️ [ZoneRepository.deleteZone] Deleting zone...');
      const dbClient = tx || db;
      const result = await dbClient.delete(ZonesTable)
        .where(eq(ZonesTable.zoneId, id))
        .returning();
      logger.info('✅ [ZoneRepository.deleteZone] Zone deleted successfully');
      return result.length > 0;
    } catch (error) {
      logger.error('❌ [ZoneRepository.deleteZone] Error:', error);
      throw new Error('[ZoneRepository.deleteZone] Error deleting zone');
    }
  }
}
