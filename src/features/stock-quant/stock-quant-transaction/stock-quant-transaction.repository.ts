/**
 * Stock quant transaction repository
 *
 * @description Data access for `stock_quant_transaction` rows (SKU moves between racks).
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { logger } from "@/util/logger";
import { pagination, PgQueryType } from "@/util/pagination";
import { PaginatedResponse, PaginationParams } from "../../rbac/rbac.model";
import { StockQuantTransactionTable } from "./stock-quant-transaction.model";
import type { DbTransaction } from "@/types/db-transaction";
import { SkuTable } from "../../master-data/sku.model";
import { RacksTable } from "../../master-data/racks.model";

const SourceRackTable = alias(RacksTable, "stock_quant_transaction_source_rack");
const DestinationRackTable = alias(RacksTable, "stock_quant_transaction_dest_rack");

export type StockQuantTransactionType = typeof StockQuantTransactionTable.$inferSelect;
export type StockQuantTransactionInsertType = typeof StockQuantTransactionTable.$inferInsert;
export type StockQuantTransactionListType = StockQuantTransactionType & {
  skuCode: string | null;
  sourceRackLabel: string | null;
  destinationRackLabel: string | null;
};

export type StockQuantTransactionFilter = {
  id?: string;
  skuId?: string | string[];
  sourceRackId?: string | string[];
  destinationRackId?: string | string[];
  type?: string;
};

export type StockQuantTransactionUpdateInput = {
  lotNo?: string | null;
  description?: string | null;
  quantity?: string;
  sourceRackId?: string;
  destinationRackId?: string | null;
  type?: string | null;
  updatedBy: string;
};

function buildTransactionFilterWhere(organizationId: string, filter: StockQuantTransactionFilter) {
  const conditions = [eq(StockQuantTransactionTable.organizationId, organizationId)];

  if (filter.id) {
    conditions.push(eq(StockQuantTransactionTable.id, filter.id));
  }

  if (Array.isArray(filter.skuId)) {
    conditions.push(inArray(StockQuantTransactionTable.skuId, filter.skuId));
  } else if (filter.skuId) {
    conditions.push(eq(StockQuantTransactionTable.skuId, filter.skuId));
  }

  if (Array.isArray(filter.sourceRackId)) {
    conditions.push(inArray(StockQuantTransactionTable.sourceRackId, filter.sourceRackId));
  } else if (filter.sourceRackId) {
    conditions.push(eq(StockQuantTransactionTable.sourceRackId, filter.sourceRackId));
  }

  if (Array.isArray(filter.destinationRackId)) {
    conditions.push(inArray(StockQuantTransactionTable.destinationRackId, filter.destinationRackId));
  } else if (filter.destinationRackId) {
    conditions.push(eq(StockQuantTransactionTable.destinationRackId, filter.destinationRackId));
  }

  if (filter.type) {
    conditions.push(eq(StockQuantTransactionTable.type, filter.type));
  }

  return and(...conditions);
}

export class StockQuantTransactionRepositoryClass {
  constructor() {}

  private listSelectFields() {
    return {
      id: StockQuantTransactionTable.id,
      skuId: StockQuantTransactionTable.skuId,
      lotNo: StockQuantTransactionTable.lotNo,
      description: StockQuantTransactionTable.description,
      quantity: StockQuantTransactionTable.quantity,
      sourceRackId: StockQuantTransactionTable.sourceRackId,
      destinationRackId: StockQuantTransactionTable.destinationRackId,
      type: StockQuantTransactionTable.type,
      organizationId: StockQuantTransactionTable.organizationId,
      createdAt: StockQuantTransactionTable.createdAt,
      updatedAt: StockQuantTransactionTable.updatedAt,
      createdBy: StockQuantTransactionTable.createdBy,
      updatedBy: StockQuantTransactionTable.updatedBy,
      skuCode: SkuTable.skuCode,
      sourceRackLabel: sql<string | null>`concat_ws('-', ${SourceRackTable.rackRow}, ${SourceRackTable.rackLevel}, ${SourceRackTable.rackColumn})`,
      destinationRackLabel: sql<string | null>`concat_ws('-', ${DestinationRackTable.rackRow}, ${DestinationRackTable.rackLevel}, ${DestinationRackTable.rackColumn})`,
    };
  }

  private baseListQuery(organizationId: string, filter: StockQuantTransactionFilter) {
    return db
      .select(this.listSelectFields())
      .from(StockQuantTransactionTable)
      .leftJoin(SkuTable, eq(SkuTable.skuId, StockQuantTransactionTable.skuId))
      .leftJoin(SourceRackTable, eq(SourceRackTable.rackId, StockQuantTransactionTable.sourceRackId))
      .leftJoin(
        DestinationRackTable,
        eq(DestinationRackTable.rackId, StockQuantTransactionTable.destinationRackId),
      )
      .where(buildTransactionFilterWhere(organizationId, filter))
      .orderBy(desc(StockQuantTransactionTable.updatedAt));
  }

  async getStockQuantTransactions(
    organizationId: string,
    filter: StockQuantTransactionFilter,
    paginationParams: PaginationParams,
  ): Promise<PaginatedResponse<StockQuantTransactionListType>> {
    try {
      logger.info("ℹ️ [StockQuantTransactionRepository.getStockQuantTransactions] Listing...");

      const whereClause = buildTransactionFilterWhere(organizationId, filter);

      const baseQuery = this.baseListQuery(organizationId, filter);

      const pageSize = paginationParams.pageSize ?? 20;
      const pageNumber = paginationParams.pageNumber ?? 1;

      const totalRow = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(StockQuantTransactionTable)
        .where(whereClause);

      const totalCount = totalRow[0]?.count ?? 0;

      const paged = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = (await paged.query) as StockQuantTransactionListType[];

      logger.info("✅ [StockQuantTransactionRepository.getStockQuantTransactions] Done");
      return { query: data, pagination: paged.pagination };
    } catch (error) {
      logger.error("❌ [StockQuantTransactionRepository.getStockQuantTransactions]", error);
      throw error;
    }
  }

  async getStockQuantTransactionById(
    organizationId: string,
    id: string,
  ): Promise<StockQuantTransactionListType | null> {
    try {
      const rows = await this.baseListQuery(organizationId, { id }).limit(1);
      return rows[0] ?? null;
    } catch (error) {
      logger.error("❌ [StockQuantTransactionRepository.getStockQuantTransactionById]", error);
      throw error;
    }
  }

  async findByReferenceAndType(
    organizationId: string,
    referenceNo: string,
    type: string,
    skuId?: string,
    tx?: DbTransaction,
  ): Promise<StockQuantTransactionType[]> {
    try {
      const client = tx ?? db;
      const conditions = [
        eq(StockQuantTransactionTable.organizationId, organizationId),
        eq(StockQuantTransactionTable.description, referenceNo),
        eq(StockQuantTransactionTable.type, type),
      ];
      if (skuId) {
        conditions.push(eq(StockQuantTransactionTable.skuId, skuId));
      }
      return client
        .select()
        .from(StockQuantTransactionTable)
        .where(and(...conditions))
        .orderBy(StockQuantTransactionTable.createdAt);
    } catch (error) {
      logger.error("❌ [StockQuantTransactionRepository.findByReferenceAndType]", error);
      throw error;
    }
  }

  async createStockQuantTransaction(
    data: StockQuantTransactionInsertType,
    tx?: DbTransaction,
  ): Promise<StockQuantTransactionType> {
    try {
      const client = tx ?? db;
      logger.info("ℹ️ [StockQuantTransactionRepository.createStockQuantTransaction] Creating...");

      const [row] = await client.insert(StockQuantTransactionTable).values(data).returning();

      logger.info("✅ [StockQuantTransactionRepository.createStockQuantTransaction] Created");
      return row;
    } catch (error) {
      logger.error("❌ [StockQuantTransactionRepository.createStockQuantTransaction]", error);
      throw error;
    }
  }

  async updateStockQuantTransaction(
    organizationId: string,
    id: string,
    patch: StockQuantTransactionUpdateInput,
    tx?: DbTransaction,
  ): Promise<StockQuantTransactionType | null> {
    try {
      const client = tx ?? db;
      const { updatedBy, ...rest } = patch;

      const [row] = await client
        .update(StockQuantTransactionTable)
        .set({
          ...rest,
          updatedBy,
          updatedAt: new Date(),
        })
        .where(
          and(eq(StockQuantTransactionTable.organizationId, organizationId), eq(StockQuantTransactionTable.id, id)),
        )
        .returning();

      return row ?? null;
    } catch (error) {
      logger.error("❌ [StockQuantTransactionRepository.updateStockQuantTransaction]", error);
      throw error;
    }
  }

  async deleteStockQuantTransaction(
    organizationId: string,
    id: string,
    tx?: DbTransaction,
  ): Promise<boolean> {
    try {
      const client = tx ?? db;
      await client
        .delete(StockQuantTransactionTable)
        .where(
          and(eq(StockQuantTransactionTable.organizationId, organizationId), eq(StockQuantTransactionTable.id, id)),
        );
      return true;
    } catch (error) {
      logger.error("❌ [StockQuantTransactionRepository.deleteStockQuantTransaction]", error);
      throw error;
    }
  }
}
