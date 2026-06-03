import { db } from '@/db';
import { PickingCriteriaInsertType, PickingCriteriaTable, PickingCriteriaType } from './picking-criteria.model';
import { eq, and, like, asc, desc } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

export type PickingCriteriaFilter = {
  id?: string;
  userId?: string;
  category?: string;
  chain?: string;
  channel?: string;
  debtor?: string;
  deliveryPoint?: string;
  storageClass?: string;
  brand?: string;
  itemCategory?: string;
  manufacturer?: string;
  item?: string;
  sortBy?: string;
  sortOrder?: string;
};

export class PickingCriteriaRepositoryClass {
  constructor() {}

  async getPickingCriterias(
    filter: PickingCriteriaFilter,
    paginationParams: PaginationParams,
    organizationId?: string,
  ): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [PickingCriteriaRepository.getPickingCriterias] Getting picking criterias...');

      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(PickingCriteriaTable.organizationId, organizationId));
      }
      if (filter.id) {
        whereCondition.push(eq(PickingCriteriaTable.id, filter.id));
      }
      if (filter.userId) {
        whereCondition.push(like(PickingCriteriaTable.userId, `%${filter.userId}%`));
      }
      if (filter.category) {
        whereCondition.push(like(PickingCriteriaTable.category, `%${filter.category}%`));
      }
      if (filter.chain) {
        whereCondition.push(like(PickingCriteriaTable.chain, `%${filter.chain}%`));
      }
      if (filter.channel) {
        whereCondition.push(like(PickingCriteriaTable.channel, `%${filter.channel}%`));
      }
      if (filter.debtor) {
        whereCondition.push(like(PickingCriteriaTable.debtor, `%${filter.debtor}%`));
      }
      if (filter.deliveryPoint) {
        whereCondition.push(like(PickingCriteriaTable.deliveryPoint, `%${filter.deliveryPoint}%`));
      }
      if (filter.storageClass) {
        whereCondition.push(like(PickingCriteriaTable.storageClass, `%${filter.storageClass}%`));
      }
      if (filter.brand) {
        whereCondition.push(like(PickingCriteriaTable.brand, `%${filter.brand}%`));
      }
      if (filter.itemCategory) {
        whereCondition.push(like(PickingCriteriaTable.itemCategory, `%${filter.itemCategory}%`));
      }
      if (filter.manufacturer) {
        whereCondition.push(like(PickingCriteriaTable.manufacturer, `%${filter.manufacturer}%`));
      }
      if (filter.item) {
        whereCondition.push(like(PickingCriteriaTable.item, `%${filter.item}%`));
      }

      const sortOrderFn = filter.sortOrder?.toUpperCase() === 'ASC' ? asc : desc;
      const sortByField = filter.sortBy?.toUpperCase() ?? 'UPDATED_AT';
      const orderByCol =
        sortByField === 'USER_ID'       ? PickingCriteriaTable.userId       :
        sortByField === 'CATEGORY'      ? PickingCriteriaTable.category      :
        sortByField === 'CHAIN'         ? PickingCriteriaTable.chain         :
        sortByField === 'CHANNEL'       ? PickingCriteriaTable.channel       :
        sortByField === 'ITEM'          ? PickingCriteriaTable.item          :
        sortByField === 'CREATED_AT'    ? PickingCriteriaTable.createdAt     :
        PickingCriteriaTable.updatedAt;

      const baseQuery = db
        .select()
        .from(PickingCriteriaTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)
        .orderBy(sortOrderFn(orderByCol));

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [PickingCriteriaRepository.getPickingCriterias] Picking criterias fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [PickingCriteriaRepository.getPickingCriterias] Error:', error);
      throw error;
    }
  }

  async getPickingCriteriaById(id: string, organizationId?: string): Promise<PickingCriteriaType | null> {
    try {
      logger.info('ℹ️ [PickingCriteriaRepository.getPickingCriteriaById] Getting picking criteria by ID...');
      const conditions = [eq(PickingCriteriaTable.id, id)];
      if (organizationId) conditions.push(eq(PickingCriteriaTable.organizationId, organizationId));
      const [record] = await db
        .select()
        .from(PickingCriteriaTable)
        .where(and(...conditions))
        .limit(1);
      logger.info('✅ [PickingCriteriaRepository.getPickingCriteriaById] Picking criteria fetched successfully');
      return record || null;
    } catch (error) {
      logger.error('❌ [PickingCriteriaRepository.getPickingCriteriaById] Error:', error);
      throw error;
    }
  }

  async createPickingCriteria(
    data: Omit<PickingCriteriaInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<PickingCriteriaType> {
    try {
      logger.info('ℹ️ [PickingCriteriaRepository.createPickingCriteria] Creating picking criteria...');
      const dbClient = tx || db;
      const [record] = await dbClient
        .insert(PickingCriteriaTable)
        .values({ ...data, createdAt: new Date(), updatedAt: new Date() })
        .returning();
      logger.info('✅ [PickingCriteriaRepository.createPickingCriteria] Picking criteria created successfully');
      return record;
    } catch (error) {
      logger.error('❌ [PickingCriteriaRepository.createPickingCriteria] Error:', error);
      throw error;
    }
  }

  async updatePickingCriteria(
    id: string,
    data: Partial<PickingCriteriaInsertType>,
    organizationId?: string,
    tx?: DbTransaction,
  ): Promise<PickingCriteriaType | null> {
    try {
      logger.info('ℹ️ [PickingCriteriaRepository.updatePickingCriteria] Updating picking criteria...');
      const dbClient = tx || db;
      const conditions = [eq(PickingCriteriaTable.id, id)];
      if (organizationId) conditions.push(eq(PickingCriteriaTable.organizationId, organizationId));
      const [record] = await dbClient
        .update(PickingCriteriaTable)
        .set({ ...data, updatedAt: new Date() })
        .where(and(...conditions))
        .returning();
      logger.info('✅ [PickingCriteriaRepository.updatePickingCriteria] Picking criteria updated successfully');
      return record || null;
    } catch (error) {
      logger.error('❌ [PickingCriteriaRepository.updatePickingCriteria] Error:', error);
      throw error;
    }
  }

  async deletePickingCriteria(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      logger.info('ℹ️ [PickingCriteriaRepository.deletePickingCriteria] Deleting picking criteria...');
      const dbClient = tx || db;
      const conditions = [eq(PickingCriteriaTable.id, id)];
      if (organizationId) conditions.push(eq(PickingCriteriaTable.organizationId, organizationId));
      const result = await dbClient
        .delete(PickingCriteriaTable)
        .where(and(...conditions))
        .returning();
      logger.info('✅ [PickingCriteriaRepository.deletePickingCriteria] Picking criteria deleted successfully');
      return result.length > 0;
    } catch (error) {
      logger.error('❌ [PickingCriteriaRepository.deletePickingCriteria] Error:', error);
      throw new Error('[PickingCriteriaRepository.deletePickingCriteria] Error deleting picking criteria');
    }
  }
}
