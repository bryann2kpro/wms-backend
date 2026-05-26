import { db } from '@/db';
import { SkuAssignmentTable, SkuAssignmentInsertType, SkuAssignmentType } from './sku-assignment.model';
import { OutletsTable } from '@/features/master-data/outlets.model';
import { SkuTable } from '@/features/master-data/sku.model';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

export class SkuAssignmentRepositoryClass {
  constructor() {}

  async getSkuAssignments(paginationParams: PaginationParams, organizationId?: string): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [SkuAssignmentRepository.getSkuAssignments] Fetching...');

      const whereCondition = [];
      if (organizationId) {
        whereCondition.push(eq(SkuAssignmentTable.organizationId, organizationId));
      }

      const baseQuery = db
        .select({
          id: SkuAssignmentTable.id,
          minExpiryMonth: SkuAssignmentTable.minExpiryMonth,
          createdAt: SkuAssignmentTable.createdAt,
          updatedAt: SkuAssignmentTable.updatedAt,
          createdBy: SkuAssignmentTable.createdBy,
          updatedBy: SkuAssignmentTable.updatedBy,
          outletId: OutletsTable.outletId,
          outletName: OutletsTable.outletName,
          outletCode: OutletsTable.outletCode,
          outletChain: OutletsTable.chain,
          outletChannel: OutletsTable.channel,
          outletDebtor: OutletsTable.debtor,
          skuId: SkuTable.skuId,
          skuCode: SkuTable.skuCode,
          skuDescription: SkuTable.skuDescription,
          skuBrand: SkuTable.brand,
          skuCategory: SkuTable.category,
          skuManufacturer: SkuTable.manufacturer,
        })
        .from(SkuAssignmentTable)
        .innerJoin(OutletsTable, eq(SkuAssignmentTable.outletId, OutletsTable.outletId))
        .innerJoin(SkuTable, eq(SkuAssignmentTable.skuId, SkuTable.skuId))
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [SkuAssignmentRepository.getSkuAssignments] Done');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [SkuAssignmentRepository.getSkuAssignments] Error:', error);
      throw error;
    }
  }

  async getSkuAssignmentById(id: string, organizationId?: string): Promise<any | null> {
    try {
      const whereConditions = [eq(SkuAssignmentTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(SkuAssignmentTable.organizationId, organizationId));
      }
      const [row] = await db
        .select({
          id: SkuAssignmentTable.id,
          minExpiryMonth: SkuAssignmentTable.minExpiryMonth,
          createdAt: SkuAssignmentTable.createdAt,
          updatedAt: SkuAssignmentTable.updatedAt,
          createdBy: SkuAssignmentTable.createdBy,
          updatedBy: SkuAssignmentTable.updatedBy,
          outletId: OutletsTable.outletId,
          outletName: OutletsTable.outletName,
          outletCode: OutletsTable.outletCode,
          outletChain: OutletsTable.chain,
          outletChannel: OutletsTable.channel,
          outletDebtor: OutletsTable.debtor,
          skuId: SkuTable.skuId,
          skuCode: SkuTable.skuCode,
          skuDescription: SkuTable.skuDescription,
          skuBrand: SkuTable.brand,
          skuCategory: SkuTable.category,
          skuManufacturer: SkuTable.manufacturer,
        })
        .from(SkuAssignmentTable)
        .innerJoin(OutletsTable, eq(SkuAssignmentTable.outletId, OutletsTable.outletId))
        .innerJoin(SkuTable, eq(SkuAssignmentTable.skuId, SkuTable.skuId))
        .where(and(...whereConditions))
        .limit(1);
      return row || null;
    } catch (error) {
      logger.error('❌ [SkuAssignmentRepository.getSkuAssignmentById] Error:', error);
      throw error;
    }
  }

  async createSkuAssignment(
    data: Omit<SkuAssignmentInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<SkuAssignmentType> {
    try {
      const dbClient = tx || db;
      const [row] = await dbClient
        .insert(SkuAssignmentTable)
        .values({ ...data, createdAt: new Date(), updatedAt: new Date() })
        .returning();
      logger.info('✅ [SkuAssignmentRepository.createSkuAssignment] Created');
      return row;
    } catch (error) {
      logger.error('❌ [SkuAssignmentRepository.createSkuAssignment] Error:', error);
      throw error;
    }
  }

  async updateSkuAssignment(
    id: string,
    data: Partial<SkuAssignmentInsertType>,
    organizationId?: string,
    tx?: DbTransaction,
  ): Promise<SkuAssignmentType> {
    try {
      const dbClient = tx || db;
      const whereConditions = [eq(SkuAssignmentTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(SkuAssignmentTable.organizationId, organizationId));
      }
      const [row] = await dbClient
        .update(SkuAssignmentTable)
        .set({ ...data, updatedAt: new Date() })
        .where(and(...whereConditions))
        .returning();
      logger.info('✅ [SkuAssignmentRepository.updateSkuAssignment] Updated');
      return row;
    } catch (error) {
      logger.error('❌ [SkuAssignmentRepository.updateSkuAssignment] Error:', error);
      throw error;
    }
  }

  async deleteSkuAssignment(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx || db;
      const whereConditions = [eq(SkuAssignmentTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(SkuAssignmentTable.organizationId, organizationId));
      }
      await dbClient.delete(SkuAssignmentTable).where(and(...whereConditions));
      logger.info('✅ [SkuAssignmentRepository.deleteSkuAssignment] Deleted');
      return true;
    } catch (error) {
      logger.error('❌ [SkuAssignmentRepository.deleteSkuAssignment] Error:', error);
      throw error;
    }
  }
}
