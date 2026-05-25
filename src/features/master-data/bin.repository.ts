import { db } from '@/db';
import { BinInsertType, BinsTable, BinType } from './bin.model';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

export type BinFilter = {
  binId?: string | string[];
  rackId?: string | string[];
  isPickFace?: boolean;
};

export class BinRepositoryClass {
  constructor() {}

  async getBins(filter: BinFilter, paginationParams: PaginationParams): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [BinRepository.getBins] Getting bins...');

      const whereCondition = [];

      if (Array.isArray(filter.binId)) {
        whereCondition.push(inArray(BinsTable.binId, filter.binId));
      } else if (filter.binId) {
        whereCondition.push(eq(BinsTable.binId, filter.binId));
      }

      if (Array.isArray(filter.rackId)) {
        whereCondition.push(inArray(BinsTable.rackId, filter.rackId));
      } else if (filter.rackId) {
        whereCondition.push(eq(BinsTable.rackId, filter.rackId));
      }

      if (filter.isPickFace !== undefined) {
        whereCondition.push(eq(BinsTable.isPickFace, filter.isPickFace));
      }

      const baseQuery = db
        .select()
        .from(BinsTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [BinRepository.getBins] Bins fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [BinRepository.getBins] Error:', error);
      throw error;
    }
  }

  async getBinById(id: string): Promise<BinType | null> {
    try {
      logger.info('ℹ️ [BinRepository.getBinById] Getting bin by ID...');
      const [bin] = await db
        .select()
        .from(BinsTable)
        .where(eq(BinsTable.binId, id))
        .limit(1);
      logger.info('✅ [BinRepository.getBinById] Bin fetched successfully');
      return bin || null;
    } catch (error) {
      logger.error('❌ [BinRepository.getBinById] Error:', error);
      throw error;
    }
  }

  async createBin(bin: Omit<BinInsertType, 'binId' | 'createdAt' | 'updatedAt' | 'currentVolume' | 'currentWeight'>, tx?: DbTransaction): Promise<BinType> {
    try {
      logger.info('ℹ️ [BinRepository.createBin] Creating bin...');
      const dbClient = tx || db;
      const [newBin] = await dbClient.insert(BinsTable).values({
        ...bin,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      logger.info('✅ [BinRepository.createBin] Bin created successfully');
      return newBin;
    } catch (error) {
      logger.error('❌ [BinRepository.createBin] Error:', error);
      throw error;
    }
  }

  async updateBin(id: string, bin: Partial<BinInsertType>, tx?: DbTransaction): Promise<BinType | null> {
    try {
      logger.info('ℹ️ [BinRepository.updateBin] Updating bin...');
      const dbClient = tx || db;
      const [updated] = await dbClient.update(BinsTable)
        .set({ ...bin, updatedAt: new Date() })
        .where(eq(BinsTable.binId, id))
        .returning();
      logger.info('✅ [BinRepository.updateBin] Bin updated successfully');
      return updated || null;
    } catch (error) {
      logger.error('❌ [BinRepository.updateBin] Error:', error);
      throw error;
    }
  }

  async deleteBin(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      logger.info('ℹ️ [BinRepository.deleteBin] Deleting bin...');
      const dbClient = tx || db;
      const result = await dbClient.delete(BinsTable)
        .where(eq(BinsTable.binId, id))
        .returning();
      logger.info('✅ [BinRepository.deleteBin] Bin deleted successfully');
      return result.length > 0;
    } catch (error) {
      logger.error('❌ [BinRepository.deleteBin] Error:', error);
      throw new Error('[BinRepository.deleteBin] Error deleting bin');
    }
  }
}
