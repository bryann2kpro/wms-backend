import { PaginatedResponse, PaginationParams } from "@/features/rbac/rbac.model";
import { logger } from "@/util/logger";
import { eq, inArray, sql, and, max } from "drizzle-orm";
import { InventoryBalancesTable } from "./inventory.model";

export type InventoryBalancesType = typeof InventoryBalancesTable.$inferSelect;
import { pagination, PgQueryType } from "@/util/pagination";
import { db } from "@/db";

export type InventoryBalancesFilter = {
  skuId?: string | string[];
  skuCode?: string | string[];
  recordedDate?: Date;
}

export class InventoryBalancesRepositoryClass {
  constructor() {}

  /**
   * Get Inventory Balances with optional filtering and pagination
   */
  async getInventoryBalances(
    filter: InventoryBalancesFilter,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<any>> {
    try {
      logger.info("ℹ️ [InventoryBalancesRepository.getInventoryBalances] Getting inventory balances...");
      logger.debug("Filter:", filter);

      const whereCondition = [];

      if (Array.isArray(filter.skuId)) {
        whereCondition.push(inArray(InventoryBalancesTable.skuId, filter.skuId));
      } else if (filter.skuId) {
        whereCondition.push(eq(InventoryBalancesTable.skuId, filter.skuId));
      }

      const baseQuery = db
        .select()
        .from(InventoryBalancesTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      if (paginationParams.sortBy) {
        baseQuery.orderBy(sql`${sql.identifier(paginationParams.sortBy)} ${sql.raw(paginationParams.sortOrder || 'ASC')}`);
      }
        const pageSize = paginationParams.pageSize || 10;
        const pageNumber = paginationParams.pageNumber || 1;
        const totalCount = (await baseQuery).length;
        const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
        const data = await paginatedQuery.query;

        logger.info("✅ [InventoryBalancesRepository.getInventoryBalances] Inventory balances fetched successfully");
        return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error("❌ [InventoryBalancesRepository.getInventoryBalances] Error:", error);
      throw error;
    }
  }

  /**
   * Get Inventory Balance by SKU IDs for the latest recorded date
   */
  async getInventoryBalanceBySkuIds(skuIds: string[]): Promise<InventoryBalancesType[] | null> {
    try {
      logger.info("ℹ️ [InventoryBalancesRepository.getInventoryBalanceBySkuIds] Getting inventory balances by SKU IDs for latest recorded date...");
      logger.debug("SKU IDs:", skuIds);

      if (!skuIds.length) {
          return [];
      }

      const balances = await db.select().from(InventoryBalancesTable).where(inArray(InventoryBalancesTable.skuId, skuIds));

      logger.info("✅ [InventoryBalancesRepository.getInventoryBalanceBySkuIds] Inventory balances fetched successfully");
      return balances;
    } catch (error) {
      logger.error("❌ [InventoryBalancesRepository.getInventoryBalanceBySkuIds] Error:", error);
      throw error;
    }
  }
}