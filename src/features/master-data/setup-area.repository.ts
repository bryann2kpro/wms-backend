/**
 * Setup Area Repository
 *
 * @description Data access layer for WMS Setup > Area master data (m_area).
 */

import { db } from '@/db';
import { SetupAreaTable, SetupAreaType, SetupAreaInsertType } from './setup-area.model';
import { eq, and, like } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

export type SetupAreaFilter = {
  id?: string;
  code?: string;
  description?: string;
};

export class SetupAreaRepositoryClass {
  constructor() {}

  async getSetupAreas(
    filter: SetupAreaFilter,
    paginationParams: PaginationParams,
    organizationId?: string,
  ): Promise<PaginatedResponse<SetupAreaType>> {
    try {
      logger.info('ℹ️ [SetupAreaRepository.getSetupAreas] Getting setup areas...');
      logger.debug('Filter:', filter);

      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(SetupAreaTable.organizationId, organizationId));
      }

      if (filter.id) {
        whereCondition.push(eq(SetupAreaTable.id, filter.id));
      }

      if (filter.code) {
        whereCondition.push(like(SetupAreaTable.code, `%${filter.code}%`));
      }

      if (filter.description) {
        whereCondition.push(like(SetupAreaTable.description, `%${filter.description}%`));
      }

      const baseQuery = db
        .select({
          id: SetupAreaTable.id,
          organizationId: SetupAreaTable.organizationId,
          code: SetupAreaTable.code,
          description: SetupAreaTable.description,
          createdAt: SetupAreaTable.createdAt,
          updatedAt: SetupAreaTable.updatedAt,
          createdBy: SetupAreaTable.createdBy,
          updatedBy: SetupAreaTable.updatedBy,
        })
        .from(SetupAreaTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [SetupAreaRepository.getSetupAreas] Setup areas fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [SetupAreaRepository.getSetupAreas] Error:', error);
      throw error;
    }
  }

  async getSetupAreaById(id: string, organizationId?: string): Promise<SetupAreaType | null> {
    try {
      logger.info('ℹ️ [SetupAreaRepository.getSetupAreaById] Getting setup area by ID...');
      const whereConditions = [eq(SetupAreaTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(SetupAreaTable.organizationId, organizationId));
      }
      const [record] = await db
        .select()
        .from(SetupAreaTable)
        .where(and(...whereConditions))
        .limit(1);

      logger.info('✅ [SetupAreaRepository.getSetupAreaById] Setup area fetched successfully');
      return record || null;
    } catch (error) {
      logger.error('❌ [SetupAreaRepository.getSetupAreaById] Error:', error);
      throw error;
    }
  }

  async createSetupArea(
    data: Omit<SetupAreaInsertType, 'id' | 'createdAt' | 'updatedAt'> & { organizationId: string },
    organizationId?: string,
    tx?: DbTransaction,
  ): Promise<SetupAreaType> {
    try {
      logger.info('ℹ️ [SetupAreaRepository.createSetupArea] Creating setup area...');
      logger.debug('Data:', data);
      const dbClient = tx || db;
      const [newRecord] = await dbClient.insert(SetupAreaTable).values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      logger.info('✅ [SetupAreaRepository.createSetupArea] Setup area created successfully');
      return newRecord || null;
    } catch (error) {
      logger.error('❌ [SetupAreaRepository.createSetupArea] Error:', error);
      throw error;
    }
  }

  async updateSetupArea(
    data: Partial<SetupAreaInsertType>,
    id: string,
    organizationId?: string,
    tx?: DbTransaction,
  ): Promise<SetupAreaType | null> {
    try {
      logger.info('ℹ️ [SetupAreaRepository.updateSetupArea] Updating setup area...');
      logger.debug('Data:', data);
      const dbClient = tx || db;
      const whereConditions = [eq(SetupAreaTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(SetupAreaTable.organizationId, organizationId));
      }
      const [updatedRecord] = await dbClient
        .update(SetupAreaTable)
        .set({ ...data, updatedAt: new Date() })
        .where(and(...whereConditions))
        .returning();
      logger.info('✅ [SetupAreaRepository.updateSetupArea] Setup area updated successfully');
      return updatedRecord || null;
    } catch (error) {
      logger.error('❌ [SetupAreaRepository.updateSetupArea] Error:', error);
      throw error;
    }
  }

  async deleteSetupArea(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      logger.info('ℹ️ [SetupAreaRepository.deleteSetupArea] Deleting setup area...');
      logger.debug('Setup area ID:', id);
      const dbClient = tx || db;
      const whereConditions = [eq(SetupAreaTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(SetupAreaTable.organizationId, organizationId));
      }
      const result = await dbClient.delete(SetupAreaTable).where(and(...whereConditions)).returning();
      logger.info('✅ [SetupAreaRepository.deleteSetupArea] Setup area deleted successfully');
      return result.length > 0;
    } catch (error) {
      logger.error('❌ [SetupAreaRepository.deleteSetupArea] Error:', error);
      throw new Error('[SetupAreaRepository.deleteSetupArea] Error deleting setup area');
    }
  }
}
