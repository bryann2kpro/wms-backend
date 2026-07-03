import { and, count, desc, eq, gte, ilike, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger.js';
import { EsAdvanceNoticeLogTable, EsAdvanceNoticesTable, EsAdvanceNoticeType, EsItemReceiptsTable } from './es.model.js';
import { DbTransaction } from '@/types/db-transaction.js';
import { pagination, PgQueryType } from '@/util/pagination.js';
import { PaginatedResponse, PaginationParams } from '@/features/rbac/rbac.model.js';

export type EsAdvanceNoticeLogFilter = {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
};

export type EsItemReceiptFilter = {
  dateFrom?: string;
  dateTo?: string;
  poNumber?: string;
  status?: string; // "success" | "error"
};

function buildAdvanceNoticeSearchCondition(search?: string) {
  const term = search?.trim();
  if (!term) return undefined;
  const pattern = `%${term}%`;
  return or(
    ilike(EsAdvanceNoticesTable.tranid, pattern),
    sql`${EsAdvanceNoticesTable.payload}->>'entity' ILIKE ${pattern}`,
    sql`${EsAdvanceNoticesTable.payload}->>'duedate' ILIKE ${pattern}`,
    sql`${EsAdvanceNoticesTable.payload}::text ILIKE ${pattern}`,
  );
}

export class EsRepositoryClass {
  /**
   * Find an advance notice by its record id.
   * Used when createInbound receives advanceNoticeId from the UI.
   */
  async findById(id: string): Promise<EsAdvanceNoticeType | null> {
    try {
      logger.info(`ℹ️ [EsRepository.findById] Fetching ASN by id: ${id}`);
      const [record] = await db
        .select()
        .from(EsAdvanceNoticesTable)
        .where(eq(EsAdvanceNoticesTable.id, id))
        .limit(1);
      return record ?? null;
    } catch (error) {
      logger.error('❌ [EsRepository.findById] Error:', error);
      throw error;
    }
  }

  /**
   * Find an existing advance notice by tranid.
   * Used for duplicate detection before saving.
   */
  async findByTranid(tranid: string, tx?: DbTransaction): Promise<EsAdvanceNoticeType | null> {
    try {
      logger.info(`ℹ️ [EsRepository.findByTranid] Checking for tranid: ${tranid}`);
      const query = tx ?? db;
      const [record] = await query
        .select()
        .from(EsAdvanceNoticesTable)
        .where(eq(EsAdvanceNoticesTable.tranid, tranid))
        .limit(1);
      return record ?? null;
    } catch (error) {
      logger.error('❌ [EsRepository.findByTranid] Error:', error);
      throw error;
    }
  }

  /**
   * Find all advance notices not yet linked to a GRN.
   * Used to populate the ASN dropdown when creating a new GRN.
   */
  async findPending(): Promise<EsAdvanceNoticeType[]> {
    try {
      logger.info('ℹ️ [EsRepository.findPending] Fetching pending advance notices');
      return await db
        .select()
        .from(EsAdvanceNoticesTable)
        .where(isNull(EsAdvanceNoticesTable.linkedGrnId))
        .orderBy(EsAdvanceNoticesTable.receivedAt);
    } catch (error) {
      logger.error('❌ [EsRepository.findPending] Error:', error);
      throw error;
    }
  }

  /**
   * Find advance notices already linked to a GRN, most-recent first.
   * Used (alongside findPending) to detect partially-fulfilled POs that still
   * need follow-up deliveries — bounded to the most recent records since fully
   * fulfilled older POs are filtered out by the caller anyway.
   */
  async findLinked(limit?: number): Promise<EsAdvanceNoticeType[]> {
    try {
      logger.info('ℹ️ [EsRepository.findLinked] Fetching linked advance notices');
      const query = db
        .select()
        .from(EsAdvanceNoticesTable)
        .where(sql`${EsAdvanceNoticesTable.linkedGrnId} IS NOT NULL`)
        .orderBy(desc(EsAdvanceNoticesTable.receivedAt));
      if (limit != null) {
        return await query.limit(limit);
      }
      return await query;
    } catch (error) {
      logger.error('❌ [EsRepository.findLinked] Error:', error);
      throw error;
    }
  }

  /** Pending ASNs with optional server-side search (PO, entity, due date, line SKU). */
  async findPendingFiltered(search?: string): Promise<EsAdvanceNoticeType[]> {
    try {
      const searchCond = buildAdvanceNoticeSearchCondition(search);
      const whereClause = searchCond
        ? and(isNull(EsAdvanceNoticesTable.linkedGrnId), searchCond)
        : isNull(EsAdvanceNoticesTable.linkedGrnId);
      return await db
        .select()
        .from(EsAdvanceNoticesTable)
        .where(whereClause)
        .orderBy(EsAdvanceNoticesTable.receivedAt);
    } catch (error) {
      logger.error('❌ [EsRepository.findPendingFiltered] Error:', error);
      throw error;
    }
  }

  /** Linked ASNs with optional server-side search, most-recent first. */
  async findLinkedFiltered(search?: string): Promise<EsAdvanceNoticeType[]> {
    try {
      const searchCond = buildAdvanceNoticeSearchCondition(search);
      const linkedCond = sql`${EsAdvanceNoticesTable.linkedGrnId} IS NOT NULL`;
      const whereClause = searchCond ? and(linkedCond, searchCond) : linkedCond;
      return await db
        .select()
        .from(EsAdvanceNoticesTable)
        .where(whereClause)
        .orderBy(desc(EsAdvanceNoticesTable.receivedAt));
    } catch (error) {
      logger.error('❌ [EsRepository.findLinkedFiltered] Error:', error);
      throw error;
    }
  }

  /** Paginated pending ASNs (no search = browse unlinked notices). */
  async findPendingPaginated(
    paginationParams: PaginationParams,
    search?: string,
  ): Promise<PaginatedResponse<EsAdvanceNoticeType>> {
    try {
      const searchCond = buildAdvanceNoticeSearchCondition(search);
      const whereClause = searchCond
        ? and(isNull(EsAdvanceNoticesTable.linkedGrnId), searchCond)
        : isNull(EsAdvanceNoticesTable.linkedGrnId);
      const baseQuery = db
        .select()
        .from(EsAdvanceNoticesTable)
        .where(whereClause)
        .orderBy(EsAdvanceNoticesTable.receivedAt);
      const pageSize = paginationParams.pageSize || 20;
      const pageNumber = paginationParams.pageNumber || 1;
      const countRows = await db
        .select({ total: count() })
        .from(EsAdvanceNoticesTable)
        .where(whereClause);
      const totalCount = Number(countRows[0]?.total ?? 0);
      const paginatedQuery = pagination(
        baseQuery as unknown as PgQueryType,
        pageSize,
        pageNumber,
        totalCount,
      );
      const data = (await paginatedQuery.query) as EsAdvanceNoticeType[];
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [EsRepository.findPendingPaginated] Error:', error);
      throw error;
    }
  }

  /**
   * Mark an advance notice as linked to a GRN.
   * Called within the createInbound transaction after the GRN is created.
   */
  async markLinked(id: string, grnId: string, tx?: DbTransaction): Promise<void> {
    try {
      logger.info(`ℹ️ [EsRepository.markLinked] Linking ASN ${id} to GRN ${grnId}`);
      const query = tx ?? db;
      await query
        .update(EsAdvanceNoticesTable)
        .set({ linkedGrnId: grnId })
        .where(eq(EsAdvanceNoticesTable.id, id));
    } catch (error) {
      logger.error('❌ [EsRepository.markLinked] Error:', error);
      throw error;
    }
  }

  /**
   * Persist an advance notice payload from NetSuite.
   * Returns the saved record for the acknowledgement response.
   */
  async saveAdvanceNotice(input: {
    tranid: string;
    apiKeyId: string;
    payload: unknown;
  }): Promise<EsAdvanceNoticeType> {
    try {
      logger.info(`ℹ️ [EsRepository.saveAdvanceNotice] Saving advance notice for tranid: ${input.tranid}`);
      const [record] = await db
        .insert(EsAdvanceNoticesTable)
        .values({
          tranid: input.tranid,
          apiKeyId: input.apiKeyId,
          payload: input.payload,
        })
        .returning();
      logger.info(`✅ [EsRepository.saveAdvanceNotice] Saved record id: ${record.id}`);
      return record;
    } catch (error) {
      logger.error('❌ [EsRepository.saveAdvanceNotice] Error:', error);
      throw error;
    }
  }

  async createSyntheticAdvanceNotice(input: {
    tranid: string;
    payload: unknown;
  }, tx?: DbTransaction): Promise<EsAdvanceNoticeType> {
    try {
      logger.info(`ℹ️ [EsRepository.createSyntheticAdvanceNotice] Saving manual advance notice for tranid: ${input.tranid}`);
      const payload = this.stampManualSource(input.payload);
      const query = tx ?? db;
      const [record] = await query
        .insert(EsAdvanceNoticesTable)
        .values({
          tranid: input.tranid,
          payload,
        })
        .returning();
      logger.info(`✅ [EsRepository.createSyntheticAdvanceNotice] Saved record id: ${record.id}`);
      return record;
    } catch (error) {
      logger.error('❌ [EsRepository.createSyntheticAdvanceNotice] Error:', error);
      throw error;
    }
  }

  private stampManualSource(payload: unknown): Record<string, unknown> {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return { ...(payload as Record<string, unknown>), source: 'manual' };
    }
    return { source: 'manual' };
  }

  async saveAdvanceNoticeLog(input: {
    apiKeyId: string | null;
    rawPayload: unknown;
    status: string;
    errorMessage: string | null;
    advanceNoticeId: string | null;
  }): Promise<void> {
    try {
      await db.insert(EsAdvanceNoticeLogTable).values({
        apiKeyId: input.apiKeyId ?? undefined,
        rawPayload: input.rawPayload,
        status: input.status,
        errorMessage: input.errorMessage ?? undefined,
        advanceNoticeId: input.advanceNoticeId ?? undefined,
      });
    } catch (error) {
      logger.error('❌ [EsRepository.saveAdvanceNoticeLog] Error:', error);
      throw error;
    }
  }

  async listAdvanceNoticeLogs(
    filter: EsAdvanceNoticeLogFilter,
    paginationParams: PaginationParams,
  ): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [EsRepository.listAdvanceNoticeLogs] Fetching advance notice logs');
      const whereCondition = [];

      if (filter.dateFrom) {
        whereCondition.push(gte(EsAdvanceNoticeLogTable.receivedAt, new Date(filter.dateFrom)));
      }
      if (filter.dateTo) {
        whereCondition.push(lte(EsAdvanceNoticeLogTable.receivedAt, new Date(filter.dateTo)));
      }
      if (filter.status) {
        whereCondition.push(eq(EsAdvanceNoticeLogTable.status, filter.status));
      }

      const baseQuery = db
        .select()
        .from(EsAdvanceNoticeLogTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)
        .orderBy(desc(EsAdvanceNoticeLogTable.receivedAt));

      const pageSize = paginationParams.pageSize || 20;
      const pageNumber = paginationParams.pageNumber || 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [EsRepository.listAdvanceNoticeLogs] Fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [EsRepository.listAdvanceNoticeLogs] Error:', error);
      throw error;
    }
  }

  async listItemReceipts(
    filter: EsItemReceiptFilter,
    paginationParams: PaginationParams,
  ): Promise<PaginatedResponse<any>> {
    try {
      logger.info('ℹ️ [EsRepository.listItemReceipts] Fetching item receipts');
      const whereCondition = [];

      if (filter.dateFrom) {
        whereCondition.push(gte(EsItemReceiptsTable.sentAt, new Date(filter.dateFrom)));
      }
      if (filter.dateTo) {
        whereCondition.push(lte(EsItemReceiptsTable.sentAt, new Date(filter.dateTo)));
      }
      if (filter.poNumber) {
        whereCondition.push(ilike(EsItemReceiptsTable.poNumber, `%${filter.poNumber}%`));
      }
      if (filter.status === 'success') {
        whereCondition.push(sql`${EsItemReceiptsTable.nsResponse}->>'success' = 'true'`);
      } else if (filter.status === 'error') {
        whereCondition.push(sql`${EsItemReceiptsTable.nsResponse}->>'success' != 'true'`);
      }

      const baseQuery = db
        .select()
        .from(EsItemReceiptsTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)
        .orderBy(desc(EsItemReceiptsTable.sentAt));

      const pageSize = paginationParams.pageSize || 20;
      const pageNumber = paginationParams.pageNumber || 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info('✅ [EsRepository.listItemReceipts] Fetched successfully');
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [EsRepository.listItemReceipts] Error:', error);
      throw error;
    }
  }

  async saveItemReceipt(poNumber: string, esAdvanceNoticeId: string, payload: unknown, nsResponse: unknown, tx?: DbTransaction): Promise<void> {
    try {

      const client = tx ?? db;

      logger.info(`ℹ️ [EsRepository.saveItemReceipt] Saving item receipt for esAdvanceNoticeId: ${esAdvanceNoticeId}`);
      const [record] = await client.insert(EsItemReceiptsTable).values({ poNumber, esAdvanceNoticeId, payload, nsResponse }).returning();
      logger.info(`✅ [EsRepository.saveItemReceipt] Saved record id: ${record.id}`);
    } catch (error) {
      logger.error('❌ [EsRepository.saveItemReceipt] Error:', error);
      throw error;
    }
  }

  async getItemReceipt(poNumber: string): Promise<any | null> {
    try {
      logger.info(`ℹ️ [EsRepository.getItemReceipt] Fetching item receipt by poNumber: ${poNumber}`);
      const [record] = await db
        .select()
        .from(EsItemReceiptsTable)
        .where(eq(EsItemReceiptsTable.poNumber, poNumber))
        .limit(1);
      logger.info(`✅ [EsRepository.getItemReceipt] Fetched record successfully!`);
      return record ?? null;
    } catch (error) {
      logger.error('❌ [EsRepository.getItemReceipt] Error:', error);
      throw error;
    }
  }

}

/**
 * Alias for {@link EsRepositoryClass}.
 * The inbound flow injects this repository under the `esAdvanceNoticeRepository`
 * name (it is the source of ASN expected quantities for over-receipt checks),
 * so it imports it under this clearer alias.
 */
export { EsRepositoryClass as EsAdvanceNoticeRepositoryClass };
