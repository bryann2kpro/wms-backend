import { PaginatedResponse, PaginationParams } from "@/features/rbac/rbac.model";
import { logger } from "@/util/logger";
import { eq, inArray, sql, and, ilike, or } from "drizzle-orm";
import { InventoryBalancesTable } from "./inventory.model";
import { SkuTable } from "@/features/master-data/sku.model";
import { StockUnitTable } from "@/features/master-data/stock-unit.model";
import { StockQuantTable } from "@/features/stock-quant/stock-quant.model";
import { pagination, PgQueryType } from "@/util/pagination";
import { db } from "@/db";
import { DbTransaction } from "@/types/db-transaction";
import { inventoryLotBalanceId } from "./inventory-lot-balance.utils";

export type InventoryBalancesType = typeof InventoryBalancesTable.$inferSelect;
export type InventoryBalancesInsertType = typeof InventoryBalancesTable.$inferInsert;

export type InventoryBalancesFilter = {
  skuId?: string | string[];
  skuCode?: string | string[];
  search?: string;
  recordedDate?: Date;
}

export class InventoryBalanceRepositoryClass {
  constructor() {}

  /**
   * Get Inventory Balances with optional filtering and pagination.
   * Joins with m_skus and m_stock_units to expose SKU details on each balance row.
   */
  async getInventoryBalances(
    organizationId: string,
    filter: InventoryBalancesFilter,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<any>> {
    try {
      logger.info("ℹ️ [InventoryBalancesRepository.getInventoryBalances] Getting inventory balances...");
      logger.debug("Filter:", filter);

      const whereCondition = [eq(InventoryBalancesTable.organizationId, organizationId)];

      if (Array.isArray(filter.skuId)) {
        whereCondition.push(inArray(InventoryBalancesTable.skuId, filter.skuId));
      } else if (filter.skuId) {
        whereCondition.push(eq(InventoryBalancesTable.skuId, filter.skuId));
      }

      if (Array.isArray(filter.skuCode)) {
        whereCondition.push(inArray(SkuTable.skuCode, filter.skuCode));
      } else if (filter.skuCode) {
        whereCondition.push(ilike(SkuTable.skuCode, `%${filter.skuCode}%`));
      }

      if (filter.search) {
        whereCondition.push(
          or(
            ilike(SkuTable.skuCode, `%${filter.search}%`),
            ilike(SkuTable.skuDescription, `%${filter.search}%`),
          )
        );
      }

      const baseQuery = db
        .select({
          id: InventoryBalancesTable.id,
          skuId: InventoryBalancesTable.skuId,
          onHandQty: InventoryBalancesTable.onHandQty,
          lossQty: InventoryBalancesTable.lossQty,
          reservedQty: InventoryBalancesTable.reservedQty,
          updatedAt: InventoryBalancesTable.updatedAt,
          skuCode: SkuTable.skuCode,
          skuDescription: SkuTable.skuDescription,
          pickingStrategy: SkuTable.pickingStrategy,
          isExpiryControlled: SkuTable.isExpiryControlled,
          skuExpiryDate: SkuTable.skuExpiryDate,
          unitCode: StockUnitTable.unitCode,
          unitName: StockUnitTable.unitName,
        })
        .from(InventoryBalancesTable)
        .innerJoin(SkuTable, eq(InventoryBalancesTable.skuId, SkuTable.skuId))
        .leftJoin(StockUnitTable, eq(SkuTable.skuUom, StockUnitTable.stockUnitId))
        .where(and(...whereCondition))
        .orderBy(sql`${SkuTable.skuCode} ASC`);

      const pageSize = paginationParams.pageSize || 50;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
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
   * Inventory lot balances aggregated from stock_quant by (skuId, lotKey).
   * Rows with empty lot_no merge into one line per SKU; each distinct lot is its own row.
   */
  async getInventoryLotBalances(
    organizationId: string,
    filter: InventoryBalancesFilter,
    paginationParams: PaginationParams,
  ): Promise<PaginatedResponse<any>> {
    try {
      logger.info(
        "ℹ️ [InventoryBalancesRepository.getInventoryLotBalances] Getting inventory lot balances...",
      );
      logger.debug("Filter:", filter);

      const search = filter.search?.trim() || null;
      const skuIdFilter = filter.skuId
        ? Array.isArray(filter.skuId)
          ? filter.skuId
          : [filter.skuId]
        : null;

      const skuCodeFilter = filter.skuCode
        ? Array.isArray(filter.skuCode)
          ? filter.skuCode
          : [filter.skuCode]
        : null;

      const stockQuantConditions = [eq(StockQuantTable.organizationId, organizationId)];
      if (skuIdFilter) {
        stockQuantConditions.push(inArray(StockQuantTable.skuId, skuIdFilter));
      }

      const lotBalancesSubquery = db
        .select({
          skuId: StockQuantTable.skuId,
          lotKey: sql<string>`CASE WHEN trim(coalesce(${StockQuantTable.lotNo}, '')) = '' THEN '__no_lot__' ELSE trim(${StockQuantTable.lotNo}) END`.as(
            "lot_key",
          ),
          lotNo: sql<string | null>`CASE WHEN trim(coalesce(${StockQuantTable.lotNo}, '')) = '' THEN NULL ELSE trim(${StockQuantTable.lotNo}) END`.as(
            "lot_no",
          ),
          onHandQty: sql<string>`SUM(${StockQuantTable.quantity})::text`.as(
            "sq_on_hand_qty",
          ),
          updatedAt: sql<Date>`MAX(${StockQuantTable.updatedAt})`.as("sq_updated_at"),
        })
        .from(StockQuantTable)
        .where(and(...stockQuantConditions))
        .groupBy(
          StockQuantTable.skuId,
          sql`CASE WHEN trim(coalesce(${StockQuantTable.lotNo}, '')) = '' THEN '__no_lot__' ELSE trim(${StockQuantTable.lotNo}) END`,
          sql`CASE WHEN trim(coalesce(${StockQuantTable.lotNo}, '')) = '' THEN NULL ELSE trim(${StockQuantTable.lotNo}) END`,
        )
        .as("lot_balances");

      const whereCondition = [sql`1 = 1`];

      if (skuCodeFilter) {
        whereCondition.push(inArray(SkuTable.skuCode, skuCodeFilter));
      } else if (filter.skuCode && !Array.isArray(filter.skuCode)) {
        whereCondition.push(ilike(SkuTable.skuCode, `%${filter.skuCode}%`));
      }

      if (search) {
        whereCondition.push(
          or(
            ilike(SkuTable.skuCode, `%${search}%`),
            ilike(SkuTable.skuDescription, `%${search}%`),
            sql`${lotBalancesSubquery.lotNo} IS NOT NULL AND ${lotBalancesSubquery.lotNo} ILIKE ${`%${search}%`}`,
          )!,
        );
      }

      const baseQuery = db
        .select({
          skuId: lotBalancesSubquery.skuId,
          lotKey: lotBalancesSubquery.lotKey,
          lotNo: lotBalancesSubquery.lotNo,
          onHandQty: lotBalancesSubquery.onHandQty,
          updatedAt: lotBalancesSubquery.updatedAt,
          lossQty: InventoryBalancesTable.lossQty,
          reservedQty: InventoryBalancesTable.reservedQty,
          skuCode: SkuTable.skuCode,
          skuDescription: SkuTable.skuDescription,
          pickingStrategy: SkuTable.pickingStrategy,
          isExpiryControlled: SkuTable.isExpiryControlled,
          skuExpiryDate: SkuTable.skuExpiryDate,
          unitCode: StockUnitTable.unitCode,
          unitName: StockUnitTable.unitName,
        })
        .from(lotBalancesSubquery)
        .innerJoin(SkuTable, eq(lotBalancesSubquery.skuId, SkuTable.skuId))
        .leftJoin(
          InventoryBalancesTable,
          and(
            eq(InventoryBalancesTable.skuId, lotBalancesSubquery.skuId),
            eq(InventoryBalancesTable.organizationId, organizationId),
          ),
        )
        .leftJoin(StockUnitTable, eq(SkuTable.skuUom, StockUnitTable.stockUnitId))
        .where(and(...whereCondition))
        .orderBy(sql`${SkuTable.skuCode} ASC`, sql`${lotBalancesSubquery.lotKey} ASC`);

      const pageSize = paginationParams.pageSize || 50;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(
        baseQuery as unknown as PgQueryType,
        pageSize,
        pageNumber,
        totalCount,
      );
      const data = (await paginatedQuery.query).map((row) => ({
        ...row,
        id: inventoryLotBalanceId(row.skuId, row.lotKey),
        lossQty: row.lossQty ?? "0",
        reservedQty: row.reservedQty ?? "0",
      }));

      logger.info(
        "✅ [InventoryBalancesRepository.getInventoryLotBalances] Inventory lot balances fetched successfully",
      );
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error(
        "❌ [InventoryBalancesRepository.getInventoryLotBalances] Error:",
        error,
      );
      throw error;
    }
  }

  /**
   * Get Inventory Balance by SKU IDs for the latest recorded date
   */
  async getInventoryBalanceBySkuIds(
    skuIds: string[],
    organizationId?: string,
  ): Promise<InventoryBalancesType[] | null> {
    try {
      logger.info("ℹ️ [InventoryBalancesRepository.getInventoryBalanceBySkuIds] Getting inventory balances by SKU IDs for latest recorded date...");
      logger.debug("SKU IDs:", skuIds);

      if (!skuIds.length) {
          return [];
      }

      const where = [inArray(InventoryBalancesTable.skuId, skuIds)];
      if (organizationId) {
        where.push(eq(InventoryBalancesTable.organizationId, organizationId));
      }

      const balances = await db.select().from(InventoryBalancesTable).where(and(...where));

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