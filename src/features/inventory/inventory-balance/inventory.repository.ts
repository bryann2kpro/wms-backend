import { PaginatedResponse, PaginationParams } from "@/features/rbac/rbac.model";
import { logger } from "@/util/logger";
import { eq, inArray, sql, and, max } from "drizzle-orm";
import { InventoryBalancesTable } from "./inventory.model";
import { pagination, PgQueryType } from "@/util/pagination";
import { db } from "@/db";
import { DbTransaction } from "@/types/db-transaction";

export type InventoryBalancesType = typeof InventoryBalancesTable.$inferSelect;
export type InventoryBalancesInsertType = typeof InventoryBalancesTable.$inferInsert;

export type InventoryBalancesFilter = {
  skuId?: string | string[];
  skuCode?: string | string[];
  recordedDate?: Date;
}

export class InventoryBalanceRepositoryClass {
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

  async upsertInventoryBalance(
    data: InventoryBalancesInsertType | InventoryBalancesInsertType[],
    tx?: DbTransaction,
  ): Promise<InventoryBalancesType | InventoryBalancesType[]> {
    try {
      const client = tx ?? db;
      const items = Array.isArray(data) ? data : [data];

      const results: InventoryBalancesType[] = [];

      for (const item of items) {
        const [balance] = await client
          .insert(InventoryBalancesTable)
          .values(item)
          .onConflictDoUpdate({
            target: [InventoryBalancesTable.skuId],
            set: {
              onHandQty: item.onHandQty,
              lossQty: item.lossQty,
              reservedQty: item.reservedQty,
              updatedAt: new Date(),
            },
          })
          .returning();

        results.push(balance);
      }

      logger.info("ℹ️ [InventoryBalancesRepository.upsertInventoryBalance] Inventory balance(s) upserted successfully");

      return Array.isArray(data) ? results : results[0];
    } catch (error) {
      logger.error("❌ [InventoryBalancesRepository.upsertInventoryBalance] Error:", error);
      throw error;
    }
  }
}