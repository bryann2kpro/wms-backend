/**
 * Stock quant repository
 *
 * @description Data access for `stock_quant` rows (quantity per SKU and rack).
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { logger } from "@/util/logger";
import { pagination, PgQueryType } from "@/util/pagination";
import { PaginatedResponse, PaginationParams } from "../rbac/rbac.model";
import { StockQuantTable } from "./stock-quant.model";
import type { DbTransaction } from "@/types/db-transaction";
import { SkuTable } from "../master-data/sku.model";
import { RacksTable } from "../master-data/racks.model";

export type StockQuantType = typeof StockQuantTable.$inferSelect;
export type StockQuantInsertType = typeof StockQuantTable.$inferInsert;
export type StockQuantListType = StockQuantType & {
  skuCode: string | null;
  rackLabel: string | null;
};

export type StockQuantFilter = {
  id?: string;
  skuId?: string | string[];
  rackId?: string | string[];
};

export type StockQuantUpdateInput = {
  description?: string | null;
  quantity?: string;
  rackId?: string;
  updatedBy: string;
};

export class StockQuantRepositoryClass {
  constructor() {}

  async getStockQuants(
    organizationId: string,
    filter: StockQuantFilter,
    paginationParams: PaginationParams,
  ): Promise<PaginatedResponse<StockQuantListType>> {
    try {
      logger.info("ℹ️ [StockQuantRepository.getStockQuants] Listing stock quants...");

      const conditions = [eq(StockQuantTable.organizationId, organizationId)];

      if (filter.id) {
        conditions.push(eq(StockQuantTable.id, filter.id));
      }

      if (Array.isArray(filter.skuId)) {
        conditions.push(inArray(StockQuantTable.skuId, filter.skuId));
      } else if (filter.skuId) {
        conditions.push(eq(StockQuantTable.skuId, filter.skuId));
      }

      if (Array.isArray(filter.rackId)) {
        conditions.push(inArray(StockQuantTable.rackId, filter.rackId));
      } else if (filter.rackId) {
        conditions.push(eq(StockQuantTable.rackId, filter.rackId));
      }

      const whereClause = and(...conditions);

      const baseQuery = db
        .select({
          id: StockQuantTable.id,
          skuId: StockQuantTable.skuId,
          description: StockQuantTable.description,
          quantity: StockQuantTable.quantity,
          rackId: StockQuantTable.rackId,
          organizationId: StockQuantTable.organizationId,
          createdAt: StockQuantTable.createdAt,
          updatedAt: StockQuantTable.updatedAt,
          createdBy: StockQuantTable.createdBy,
          updatedBy: StockQuantTable.updatedBy,
          skuCode: SkuTable.skuCode,
          rackLabel: sql<string | null>`concat_ws('-', ${RacksTable.rackRow}, ${RacksTable.rackLevel}, ${RacksTable.rackColumn})`,
        })
        .from(StockQuantTable)
        .leftJoin(SkuTable, eq(SkuTable.skuId, StockQuantTable.skuId))
        .leftJoin(RacksTable, eq(RacksTable.rackId, StockQuantTable.rackId))
        .where(whereClause)
        .orderBy(desc(StockQuantTable.updatedAt));

      const pageSize = paginationParams.pageSize ?? 20;
      const pageNumber = paginationParams.pageNumber ?? 1;

      const totalRow = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(StockQuantTable)
        .where(whereClause);

      const totalCount = totalRow[0]?.count ?? 0;

      const paged = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = (await paged.query) as StockQuantListType[];

      logger.info("✅ [StockQuantRepository.getStockQuants] Done");
      return { query: data, pagination: paged.pagination };
    } catch (error) {
      logger.error("❌ [StockQuantRepository.getStockQuants]", error);
      throw error;
    }
  }

  async getStockQuantById(organizationId: string, id: string): Promise<StockQuantType | null> {
    try {
      const rows = await db
        .select()
        .from(StockQuantTable)
        .where(and(eq(StockQuantTable.organizationId, organizationId), eq(StockQuantTable.id, id)))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      logger.error("❌ [StockQuantRepository.getStockQuantById]", error);
      throw error;
    }
  }

  async getStockQuantBySkuAndRack(
    organizationId: string,
    skuId: string,
    rackId: string,
  ): Promise<StockQuantType | null> {
    try {
      const rows = await db
        .select()
        .from(StockQuantTable)
        .where(
          and(
            eq(StockQuantTable.organizationId, organizationId),
            eq(StockQuantTable.skuId, skuId),
            eq(StockQuantTable.rackId, rackId),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      logger.error("❌ [StockQuantRepository.getStockQuantBySkuAndRack]", error);
      throw error;
    }
  }

  async createStockQuant(
    data: StockQuantInsertType,
    tx?: DbTransaction,
  ): Promise<StockQuantType> {
    try {
      const client = tx ?? db;
      logger.info("ℹ️ [StockQuantRepository.createStockQuant] Creating...");

      const [row] = await client.insert(StockQuantTable).values(data).returning();

      logger.info("✅ [StockQuantRepository.createStockQuant] Created");
      return row;
    } catch (error) {
      logger.error("❌ [StockQuantRepository.createStockQuant]", error);
      throw error;
    }
  }

  async createStockQuants(
    data: StockQuantInsertType[],
    tx?: DbTransaction,
  ): Promise<StockQuantType[]> {
    try {
      if (data.length === 0) return [];
      const client = tx ?? db;
      logger.info("ℹ️ [StockQuantRepository.createStockQuants] Batch creating...");

      const rows = await client.insert(StockQuantTable).values(data).returning();

      logger.info("✅ [StockQuantRepository.createStockQuants] Created");
      return rows;
    } catch (error) {
      logger.error("❌ [StockQuantRepository.createStockQuants]", error);
      throw error;
    }
  }

  async updateStockQuant(
    organizationId: string,
    id: string,
    patch: StockQuantUpdateInput,
    tx?: DbTransaction,
  ): Promise<StockQuantType | null> {
    try {
      const client = tx ?? db;
      const { updatedBy, ...rest } = patch;

      const [row] = await client
        .update(StockQuantTable)
        .set({
          ...rest,
          updatedBy,
          updatedAt: new Date(),
        })
        .where(and(eq(StockQuantTable.organizationId, organizationId), eq(StockQuantTable.id, id)))
        .returning();

      return row ?? null;
    } catch (error) {
      logger.error("❌ [StockQuantRepository.updateStockQuant]", error);
      throw error;
    }
  }

  async deleteStockQuant(organizationId: string, id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const client = tx ?? db;
      await client
        .delete(StockQuantTable)
        .where(and(eq(StockQuantTable.organizationId, organizationId), eq(StockQuantTable.id, id)));
      return true;
    } catch (error) {
      logger.error("❌ [StockQuantRepository.deleteStockQuant]", error);
      throw error;
    }
  }
}
