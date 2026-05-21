import { db } from '@/db';
import { PutawayRuleInsertType, PutawayRulesTable, PutawayRuleType } from './putaway-rule.model';
import { eq, and, like, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

export type PutawayRuleFilter = {
  putawayRuleId?: string | string[];
  warehouseId?: string;
  targetZonePurpose?: string;
};

export class PutawayRuleRepositoryClass {
  constructor() {}

  async getPutawayRules(filter: PutawayRuleFilter, paginationParams: PaginationParams): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [PutawayRuleRepository.getPutawayRules] Getting putaway rules...');

      const whereCondition = [];

      if (Array.isArray(filter.putawayRuleId)) {
        whereCondition.push(inArray(PutawayRulesTable.putawayRuleId, filter.putawayRuleId));
      } else if (filter.putawayRuleId) {
        whereCondition.push(eq(PutawayRulesTable.putawayRuleId, filter.putawayRuleId));
      }

      if (filter.warehouseId) {
        whereCondition.push(eq(PutawayRulesTable.warehouseId, filter.warehouseId));
      }

      if (filter.targetZonePurpose) {
        whereCondition.push(like(PutawayRulesTable.targetZonePurpose, `%${filter.targetZonePurpose}%`));
      }

      const baseQuery = db
        .select()
        .from(PutawayRulesTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [PutawayRuleRepository.getPutawayRules] Putaway rules fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [PutawayRuleRepository.getPutawayRules] Error:', error);
      throw error;
    }
  }

  async getPutawayRuleById(id: string): Promise<PutawayRuleType | null> {
    try {
      logger.info('ℹ️ [PutawayRuleRepository.getPutawayRuleById] Getting putaway rule by ID...');
      const [rule] = await db
        .select()
        .from(PutawayRulesTable)
        .where(eq(PutawayRulesTable.putawayRuleId, id))
        .limit(1);
      logger.info('✅ [PutawayRuleRepository.getPutawayRuleById] Putaway rule fetched successfully');
      return rule || null;
    } catch (error) {
      logger.error('❌ [PutawayRuleRepository.getPutawayRuleById] Error:', error);
      throw error;
    }
  }

  async createPutawayRule(rule: Omit<PutawayRuleInsertType, 'putawayRuleId' | 'createdAt' | 'updatedAt'>, tx?: DbTransaction): Promise<PutawayRuleType> {
    try {
      logger.info('ℹ️ [PutawayRuleRepository.createPutawayRule] Creating putaway rule...');
      const dbClient = tx || db;
      const [newRule] = await dbClient.insert(PutawayRulesTable).values({
        ...rule,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      logger.info('✅ [PutawayRuleRepository.createPutawayRule] Putaway rule created successfully');
      return newRule;
    } catch (error) {
      logger.error('❌ [PutawayRuleRepository.createPutawayRule] Error:', error);
      throw error;
    }
  }

  async updatePutawayRule(id: string, rule: Partial<PutawayRuleInsertType>, tx?: DbTransaction): Promise<PutawayRuleType | null> {
    try {
      logger.info('ℹ️ [PutawayRuleRepository.updatePutawayRule] Updating putaway rule...');
      const dbClient = tx || db;
      const [updated] = await dbClient.update(PutawayRulesTable)
        .set({ ...rule, updatedAt: new Date() })
        .where(eq(PutawayRulesTable.putawayRuleId, id))
        .returning();
      logger.info('✅ [PutawayRuleRepository.updatePutawayRule] Putaway rule updated successfully');
      return updated || null;
    } catch (error) {
      logger.error('❌ [PutawayRuleRepository.updatePutawayRule] Error:', error);
      throw error;
    }
  }

  async deletePutawayRule(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      logger.info('ℹ️ [PutawayRuleRepository.deletePutawayRule] Deleting putaway rule...');
      const dbClient = tx || db;
      const result = await dbClient.delete(PutawayRulesTable)
        .where(eq(PutawayRulesTable.putawayRuleId, id))
        .returning();
      logger.info('✅ [PutawayRuleRepository.deletePutawayRule] Putaway rule deleted successfully');
      return result.length > 0;
    } catch (error) {
      logger.error('❌ [PutawayRuleRepository.deletePutawayRule] Error:', error);
      throw new Error('[PutawayRuleRepository.deletePutawayRule] Error deleting putaway rule');
    }
  }
}
