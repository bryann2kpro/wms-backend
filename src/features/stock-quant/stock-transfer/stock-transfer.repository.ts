/**
 * Stock Transfer Repository
 *
 * @description Data access layer for Stock Transfer operations (bin-to-bin and
 * warehouse-to-warehouse). Mirrors the shape/style of stock-adjustment and
 * putaway repositories. Stock-quant debit/credit mechanics live in
 * StockQuantRepositoryClass; this repository only owns the transfer documents.
 */

import { db } from "@/db";
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { logger } from "@/util/logger";
import { PaginationParams, PaginatedResponse } from "@/features/rbac/rbac.model";
import { pagination, PgQueryType } from "@/util/pagination";
import type { DbTransaction } from "@/types/db-transaction";
import { RunningNoRepositoryClass } from "@/features/running-no/running-no.repository";
import {
  StockTransfersTable,
  StockTransferItemsTable,
  type StockTransferInsertType,
  type StockTransferType,
  type StockTransferItemInsertType,
  type StockTransferItemType,
} from "./stock-transfer.model";

// ============================================
// FILTER TYPES
// ============================================

export type StockTransferFilter = {
  id?: string;
  transferNo?: string;
  type?: string;
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
};

export class StockTransferRepositoryClass {
  constructor(
    private readonly runningNoRepository: RunningNoRepositoryClass,
  ) {}

  // ============================================
  // HEADER OPERATIONS
  // ============================================

  async createStockTransfer(
    data: Omit<StockTransferInsertType, "id" | "createdAt" | "updatedAt">,
    tx?: DbTransaction,
  ): Promise<StockTransferType> {
    try {
      const client = tx ?? db;
      const [transfer] = await client.insert(StockTransfersTable).values(data).returning();

      logger.info("✅ [StockTransferRepository.createStockTransfer] Created successfully");
      return transfer;
    } catch (error) {
      logger.error("❌ [StockTransferRepository.createStockTransfer] Error:", error);
      throw error;
    }
  }

  /**
   * Fetch a transfer header by id (org-scoped). When `forUpdate` is true the row
   * is locked `FOR UPDATE` — used by receive/cancel to serialize concurrent
   * mutations within a transaction. `forUpdate` requires a `tx`.
   */
  async getStockTransferById(
    id: string,
    organizationId: string,
    tx?: DbTransaction,
    forUpdate = false,
  ): Promise<StockTransferType | null> {
    try {
      const client = tx ?? db;
      const baseQuery = client
        .select()
        .from(StockTransfersTable)
        .where(
          and(
            eq(StockTransfersTable.id, id),
            eq(StockTransfersTable.organizationId, organizationId),
          ),
        )
        .limit(1);

      const rows = forUpdate ? await baseQuery.for("update") : await baseQuery;
      return rows[0] ?? null;
    } catch (error) {
      logger.error("❌ [StockTransferRepository.getStockTransferById] Error:", error);
      throw error;
    }
  }

  async listStockTransfers(
    organizationId: string,
    filter: StockTransferFilter,
    paginationParams?: PaginationParams,
    tx?: DbTransaction,
  ): Promise<PaginatedResponse<StockTransferType>> {
    try {
      const client = tx ?? db;
      const whereCondition = [eq(StockTransfersTable.organizationId, organizationId)];

      if (filter.id) {
        whereCondition.push(eq(StockTransfersTable.id, filter.id));
      }
      if (filter.type) {
        whereCondition.push(eq(StockTransfersTable.type, filter.type as StockTransferType["type"]));
      }
      if (filter.status) {
        whereCondition.push(eq(StockTransfersTable.status, filter.status as StockTransferType["status"]));
      }
      if (filter.search) {
        whereCondition.push(ilike(StockTransfersTable.transferNo, `%${filter.search.trim()}%`));
      } else if (filter.transferNo) {
        whereCondition.push(ilike(StockTransfersTable.transferNo, `%${filter.transferNo}%`));
      }

      const sortOrder = filter.sortOrder?.toUpperCase() === "ASC" ? asc : desc;
      const sortBy = (filter.sortBy?.toUpperCase() ?? "CREATED_AT") as string;
      const orderByColumn =
        sortBy === "TRANSFER_NO" ? StockTransfersTable.transferNo
        : sortBy === "UPDATED_AT" ? StockTransfersTable.updatedAt
        : StockTransfersTable.createdAt;

      const baseQuery = client
        .select()
        .from(StockTransfersTable)
        .where(and(...whereCondition))
        .orderBy(sortOrder(orderByColumn));

      if (!paginationParams || (!paginationParams.pageSize && !paginationParams.pageNumber)) {
        const data = (await baseQuery) as StockTransferType[];
        const totalCount = data.length;
        logger.info("✅ [StockTransferRepository.listStockTransfers] Fetched successfully (no pagination)");
        return {
          query: data,
          pagination: {
            count: totalCount,
            totalCount,
            currentPage: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false,
          },
        };
      }

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = (await paginatedQuery.query) as StockTransferType[];

      logger.info("✅ [StockTransferRepository.listStockTransfers] Fetched successfully");
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error("❌ [StockTransferRepository.listStockTransfers] Error:", error);
      throw error;
    }
  }

  // ============================================
  // ITEM OPERATIONS
  // ============================================

  async createStockTransferItems(
    items: StockTransferItemInsertType[],
    tx?: DbTransaction,
  ): Promise<StockTransferItemType[]> {
    if (items.length === 0) return [];
    try {
      const client = tx ?? db;
      const inserted = await client.insert(StockTransferItemsTable).values(items).returning();

      logger.info("✅ [StockTransferRepository.createStockTransferItems] Created successfully", { count: inserted.length });
      return inserted;
    } catch (error) {
      logger.error("❌ [StockTransferRepository.createStockTransferItems] Error:", error);
      throw error;
    }
  }

  async getStockTransferItems(
    stockTransferId: string,
    tx?: DbTransaction,
  ): Promise<StockTransferItemType[]> {
    try {
      const client = tx ?? db;
      const items = await client
        .select()
        .from(StockTransferItemsTable)
        .where(eq(StockTransferItemsTable.stockTransferId, stockTransferId));

      return items;
    } catch (error) {
      logger.error("❌ [StockTransferRepository.getStockTransferItems] Error:", error);
      throw error;
    }
  }

  // ============================================
  // RUNNING NUMBER
  // ============================================

  async generateTransferNo(tx?: DbTransaction): Promise<string> {
    const run = async (dbClient: typeof db | DbTransaction) => {
      return this.runningNoRepository.generateRunningNo(
        { scope: "stock-transfer", prefix: "TRF", width: 4 },
        dbClient,
      );
    };
    if (tx) return run(tx);
    return db.transaction(async (dbTx) => run(dbTx));
  }
}
