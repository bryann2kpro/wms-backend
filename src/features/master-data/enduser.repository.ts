import { db } from '@/db';
import { EndUserTable } from './enduser.model';
import { eq, like } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

export type EndUserType = typeof EndUserTable.$inferSelect;
export type EndUserInsertType = typeof EndUserTable.$inferInsert;

export type EndUserFilter = {
  userName?: string;
};

export class EndUserRepositoryClass {
  async getEndUsers(filter: EndUserFilter, paginationParams: PaginationParams): Promise<PaginatedResponse<EndUserType>> {
    try {
      logger.info('ℹ️ [EndUserRepository.getEndUsers] Getting end users...');

      const whereConditions = [];
      if (filter.userName) {
        whereConditions.push(like(EndUserTable.userName, `%${filter.userName}%`));
      }

      const baseQuery = db
        .select()
        .from(EndUserTable)
        .where(whereConditions.length > 0 ? whereConditions[0] : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [EndUserRepository.getEndUsers] End users fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [EndUserRepository.getEndUsers] Error:', error);
      throw error;
    }
  }

  async getEndUserById(id: string): Promise<EndUserType | null> {
    try {
      logger.info('ℹ️ [EndUserRepository.getEndUserById] Getting end user by ID...');
      const [endUser] = await db
        .select()
        .from(EndUserTable)
        .where(eq(EndUserTable.endUserId, id))
        .limit(1);
      return endUser || null;
    } catch (error) {
      logger.error('❌ [EndUserRepository.getEndUserById] Error:', error);
      throw error;
    }
  }

  async createEndUser(data: { userName: string }, tx?: DbTransaction): Promise<EndUserType> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [EndUserRepository.createEndUser] Creating end user...');
      const [endUser] = await dbClient
        .insert(EndUserTable)
        .values({ userName: data.userName })
        .returning();
      logger.info('✅ [EndUserRepository.createEndUser] End user created successfully');
      return endUser;
    } catch (error) {
      logger.error('❌ [EndUserRepository.createEndUser] Error:', error);
      throw error;
    }
  }

  async updateEndUser(id: string, data: { userName: string }, tx?: DbTransaction): Promise<EndUserType | null> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [EndUserRepository.updateEndUser] Updating end user...');
      const [endUser] = await dbClient
        .update(EndUserTable)
        .set({ userName: data.userName })
        .where(eq(EndUserTable.endUserId, id))
        .returning();
      return endUser || null;
    } catch (error) {
      logger.error('❌ [EndUserRepository.updateEndUser] Error:', error);
      throw error;
    }
  }

  async deleteEndUser(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx || db;
      logger.info('ℹ️ [EndUserRepository.deleteEndUser] Deleting end user...');
      await dbClient.delete(EndUserTable).where(eq(EndUserTable.endUserId, id));
      return true;
    } catch (error) {
      logger.error('❌ [EndUserRepository.deleteEndUser] Error:', error);
      throw error;
    }
  }
}
