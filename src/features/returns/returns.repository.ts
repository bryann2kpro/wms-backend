/**
 * Returns Repository
 *
 * @description Data access layer for Return documents and Return Items
 * (goods returned by ES outlets at delivery time: damaged / about-to-expire).
 */

import { db } from '@/db';
import { logger } from '@/util/logger';
import { eq, and, inArray, or, ilike, gte, lte, desc, sql, exists } from 'drizzle-orm';
import type { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';
import { RunningNoRepositoryClass } from '@/features/running-no/running-no.repository';
import { SkuTable } from '@/features/master-data/sku.model';
import { RacksTable } from '@/features/master-data/racks.model';
import { DocumentsTable } from '@/features/documents/documents.model';
import {
  ReturnsTable,
  ReturnItemsTable,
  ReturnDocType,
  ReturnDocInsertType,
  ReturnItemType,
  ReturnItemInsertType,
  ReturnFilter,
  ReturnReason,
  ReturnItemStatus,
  ReturnStatus,
} from './returns.model';

/** Return item joined with SKU and rack display fields. */
export type ReturnItemWithDetails = ReturnItemType & {
  skuCode: string | null;
  skuDescription: string | null;
  assignedRackLabel: string | null;
};

export type ReturnsStats = {
  receivedCount: number;
  completedCount: number;
  pendingItemCount: number;
  damagedItemCount: number;
  aboutToExpireItemCount: number;
};

const rackLabelExpr = sql<string | null>`concat_ws('-', ${RacksTable.rackRow}, ${RacksTable.rackLevel}, ${RacksTable.rackColumn})`;

export class ReturnsRepositoryClass {
  constructor(private readonly runningNoRepository: RunningNoRepositoryClass) {}

  /** Generate the next return number, e.g. RTN-20260611-0001 (atomic, tx-scoped). */
  async generateReturnNo(tx: DbTransaction): Promise<string> {
    return this.runningNoRepository.generateRunningNo({ scope: 'returns', prefix: 'RTN' }, tx);
  }

  async createReturn(data: ReturnDocInsertType, tx?: DbTransaction): Promise<ReturnDocType> {
    try {
      const client = tx ?? db;
      logger.info('ℹ️ [ReturnsRepository.createReturn] Creating return header...');
      const [row] = await client.insert(ReturnsTable).values(data).returning();
      logger.info('✅ [ReturnsRepository.createReturn] Return header created');
      return row;
    } catch (error) {
      logger.error('❌ [ReturnsRepository.createReturn] Error:', error);
      throw error;
    }
  }

  async createReturnItems(data: ReturnItemInsertType[], tx?: DbTransaction): Promise<ReturnItemType[]> {
    try {
      if (data.length === 0) return [];
      const client = tx ?? db;
      logger.info('ℹ️ [ReturnsRepository.createReturnItems] Creating return items...');
      const rows = await client.insert(ReturnItemsTable).values(data).returning();
      logger.info('✅ [ReturnsRepository.createReturnItems] Return items created');
      return rows;
    } catch (error) {
      logger.error('❌ [ReturnsRepository.createReturnItems] Error:', error);
      throw error;
    }
  }

  async getReturnById(id: string, organizationId?: string, tx?: DbTransaction): Promise<ReturnDocType | null> {
    try {
      const client = tx ?? db;
      const conditions = [eq(ReturnsTable.id, id)];
      if (organizationId) conditions.push(eq(ReturnsTable.organizationId, organizationId));
      const [row] = await client
        .select()
        .from(ReturnsTable)
        .where(and(...conditions))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('❌ [ReturnsRepository.getReturnById] Error:', error);
      throw error;
    }
  }

  /** Duplicate guard: at most one return per delivery order. */
  async getReturnByDoId(doId: string, tx?: DbTransaction): Promise<ReturnDocType | null> {
    try {
      const client = tx ?? db;
      const [row] = await client
        .select()
        .from(ReturnsTable)
        .where(eq(ReturnsTable.doId, doId))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('❌ [ReturnsRepository.getReturnByDoId] Error:', error);
      throw error;
    }
  }

  async listReturns(
    filter: ReturnFilter,
    paginationParams: PaginationParams,
    organizationId?: string,
  ): Promise<PaginatedResponse<ReturnDocType>> {
    try {
      logger.info('ℹ️ [ReturnsRepository.listReturns] Listing returns...');

      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(ReturnsTable.organizationId, organizationId));
      }

      if (Array.isArray(filter.id)) {
        whereCondition.push(inArray(ReturnsTable.id, filter.id));
      } else if (filter.id) {
        whereCondition.push(eq(ReturnsTable.id, filter.id));
      }

      if (filter.doId) {
        whereCondition.push(eq(ReturnsTable.doId, filter.doId));
      }

      if (Array.isArray(filter.status)) {
        whereCondition.push(inArray(ReturnsTable.status, filter.status));
      } else if (filter.status) {
        whereCondition.push(eq(ReturnsTable.status, filter.status));
      }

      if (filter.reason) {
        whereCondition.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(ReturnItemsTable)
              .where(and(
                eq(ReturnItemsTable.returnId, ReturnsTable.id),
                eq(ReturnItemsTable.reason, filter.reason),
              )),
          ),
        );
      }

      if (filter.search?.trim()) {
        const term = `%${filter.search.trim()}%`;
        whereCondition.push(
          or(
            ilike(ReturnsTable.returnNo, term),
            ilike(ReturnsTable.doNo, term),
            ilike(ReturnsTable.poNo, term),
          )!,
        );
      }

      if (filter.receivedAtFrom) {
        whereCondition.push(gte(ReturnsTable.receivedAt, new Date(filter.receivedAtFrom)));
      }

      if (filter.receivedAtTo) {
        const toDate = new Date(filter.receivedAtTo);
        toDate.setUTCHours(23, 59, 59, 999);
        whereCondition.push(lte(ReturnsTable.receivedAt, toDate));
      }

      const baseQuery = db
        .select()
        .from(ReturnsTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)
        .orderBy(desc(ReturnsTable.receivedAt));

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [ReturnsRepository.listReturns] Returns fetched successfully');
      return { query: data as ReturnDocType[], pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [ReturnsRepository.listReturns] Error:', error);
      throw error;
    }
  }

  /** Header-stat aggregates for the Return Management page. */
  async getReturnsStats(organizationId: string): Promise<ReturnsStats> {
    try {
      const [headerRow] = await db
        .select({
          receivedCount: sql<number>`count(*) filter (where ${ReturnsTable.status} = ${ReturnStatus.RECEIVED})::int`,
          completedCount: sql<number>`count(*) filter (where ${ReturnsTable.status} = ${ReturnStatus.COMPLETED})::int`,
        })
        .from(ReturnsTable)
        .where(eq(ReturnsTable.organizationId, organizationId));

      const [itemRow] = await db
        .select({
          pendingItemCount: sql<number>`count(*) filter (where ${ReturnItemsTable.status} = ${ReturnItemStatus.PENDING})::int`,
          damagedItemCount: sql<number>`count(*) filter (where ${ReturnItemsTable.reason} = ${ReturnReason.DAMAGED})::int`,
          aboutToExpireItemCount: sql<number>`count(*) filter (where ${ReturnItemsTable.reason} = ${ReturnReason.ABOUT_TO_EXPIRE})::int`,
        })
        .from(ReturnItemsTable)
        .innerJoin(ReturnsTable, eq(ReturnItemsTable.returnId, ReturnsTable.id))
        .where(eq(ReturnsTable.organizationId, organizationId));

      return {
        receivedCount: headerRow?.receivedCount ?? 0,
        completedCount: headerRow?.completedCount ?? 0,
        pendingItemCount: itemRow?.pendingItemCount ?? 0,
        damagedItemCount: itemRow?.damagedItemCount ?? 0,
        aboutToExpireItemCount: itemRow?.aboutToExpireItemCount ?? 0,
      };
    } catch (error) {
      logger.error('❌ [ReturnsRepository.getReturnsStats] Error:', error);
      throw error;
    }
  }

  async getReturnItemById(id: string, tx?: DbTransaction): Promise<ReturnItemType | null> {
    try {
      const client = tx ?? db;
      const [row] = await client
        .select()
        .from(ReturnItemsTable)
        .where(eq(ReturnItemsTable.id, id))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('❌ [ReturnsRepository.getReturnItemById] Error:', error);
      throw error;
    }
  }

  async getReturnItems(returnId: string, tx?: DbTransaction): Promise<ReturnItemWithDetails[]> {
    try {
      const client = tx ?? db;
      const rows = await client
        .select({
          id: ReturnItemsTable.id,
          returnId: ReturnItemsTable.returnId,
          doItemId: ReturnItemsTable.doItemId,
          skuId: ReturnItemsTable.skuId,
          lotNo: ReturnItemsTable.lotNo,
          expiryDate: ReturnItemsTable.expiryDate,
          qtyReturned: ReturnItemsTable.qtyReturned,
          reason: ReturnItemsTable.reason,
          conditionNotes: ReturnItemsTable.conditionNotes,
          status: ReturnItemsTable.status,
          qtyPutaway: ReturnItemsTable.qtyPutaway,
          assignedRackId: ReturnItemsTable.assignedRackId,
          assignedBy: ReturnItemsTable.assignedBy,
          assignedAt: ReturnItemsTable.assignedAt,
          createdAt: ReturnItemsTable.createdAt,
          updatedAt: ReturnItemsTable.updatedAt,
          createdBy: ReturnItemsTable.createdBy,
          updatedBy: ReturnItemsTable.updatedBy,
          skuCode: SkuTable.skuCode,
          skuDescription: SkuTable.skuDescription,
          assignedRackLabel: rackLabelExpr,
        })
        .from(ReturnItemsTable)
        .leftJoin(SkuTable, eq(ReturnItemsTable.skuId, SkuTable.skuId))
        .leftJoin(RacksTable, eq(ReturnItemsTable.assignedRackId, RacksTable.rackId))
        .where(eq(ReturnItemsTable.returnId, returnId))
        .orderBy(ReturnItemsTable.createdAt);
      return rows as ReturnItemWithDetails[];
    } catch (error) {
      logger.error('❌ [ReturnsRepository.getReturnItems] Error:', error);
      throw error;
    }
  }

  async updateReturn(
    id: string,
    patch: Partial<Pick<ReturnDocType, 'status' | 'completedAt' | 'notes' | 'updatedBy'>>,
    tx?: DbTransaction,
  ): Promise<ReturnDocType | null> {
    try {
      const client = tx ?? db;
      const [row] = await client
        .update(ReturnsTable)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(ReturnsTable.id, id))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('❌ [ReturnsRepository.updateReturn] Error:', error);
      throw error;
    }
  }

  async updateReturnItem(
    id: string,
    patch: Partial<
      Pick<ReturnItemType, 'status' | 'assignedRackId' | 'assignedBy' | 'assignedAt' | 'updatedBy'>
    >,
    tx?: DbTransaction,
  ): Promise<ReturnItemType | null> {
    try {
      const client = tx ?? db;
      const [row] = await client
        .update(ReturnItemsTable)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(ReturnItemsTable.id, id))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('❌ [ReturnsRepository.updateReturnItem] Error:', error);
      throw error;
    }
  }

  /** Atomic SQL increment for partial putaway accumulation. Returns the updated row. */
  async incrementReturnItemQtyPutaway(
    id: string,
    qty: number,
    userId: string,
    tx?: DbTransaction,
  ): Promise<ReturnItemType | null> {
    try {
      const client = tx ?? db;
      const [row] = await client
        .update(ReturnItemsTable)
        .set({
          qtyPutaway: sql`${ReturnItemsTable.qtyPutaway} + ${qty.toFixed(2)}::numeric`,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(ReturnItemsTable.id, id))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('❌ [ReturnsRepository.incrementReturnItemQtyPutaway] Error:', error);
      throw error;
    }
  }

  /** Count items on a return that are not yet fully assigned. */
  async countUnassignedItems(returnId: string, tx?: DbTransaction): Promise<number> {
    try {
      const client = tx ?? db;
      const [row] = await client
        .select({ count: sql<number>`count(*)::int` })
        .from(ReturnItemsTable)
        .where(and(
          eq(ReturnItemsTable.returnId, returnId),
          eq(ReturnItemsTable.status, ReturnItemStatus.PENDING),
        ));
      return row?.count ?? 0;
    } catch (error) {
      logger.error('❌ [ReturnsRepository.countUnassignedItems] Error:', error);
      throw error;
    }
  }

  /** Photos for one or more return items (documents with refType RETURN_ITEM). */
  async getReturnItemDocuments(returnItemIds: string[], tx?: DbTransaction) {
    try {
      if (returnItemIds.length === 0) return [];
      const client = tx ?? db;
      return await client
        .select()
        .from(DocumentsTable)
        .where(and(
          eq(DocumentsTable.refType, 'RETURN_ITEM'),
          inArray(DocumentsTable.refId, returnItemIds),
        ));
    } catch (error) {
      logger.error('❌ [ReturnsRepository.getReturnItemDocuments] Error:', error);
      throw error;
    }
  }
}
