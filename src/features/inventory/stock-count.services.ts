import { and, eq, ilike, or, sql } from "drizzle-orm";
import { InventoryBalancesTable } from "./inventory-balance/inventory.model";
import { SkuTable } from "../master-data/sku.model";
import { PaginatedResponse, PaginationParams } from "../rbac/rbac.model";
import { pagination, PgQueryType } from "@/util/pagination";
import { logger } from "@/util/logger";
import { db } from "@/db";

export type StockCountFilter = {
    skuId?: string;
    skuCode?: string;
    skuDescription?: string;
    search?: string;
};

export class StockCountServices {
    constructor(
    ) {}

    async getStockCount(
        filter: StockCountFilter,
        paginationParams: PaginationParams
    ): Promise<PaginatedResponse<any>> {
        try {
            const whereCondition = [];

            if (filter.skuId) {
                whereCondition.push(eq(SkuTable.skuId, filter.skuId));
            }

            if (filter.skuCode && !filter.search) {
                whereCondition.push(ilike(SkuTable.skuCode, `%${filter.skuCode.trim()}%`));
            }

            if (filter.skuDescription && !filter.search) {
                whereCondition.push(ilike(SkuTable.skuDescription, `%${filter.skuDescription.trim()}%`));
            }

            if (filter.search) {
                const term = `%${filter.search.trim()}%`;
                whereCondition.push(
                    or(
                        ilike(SkuTable.skuCode, term),
                        ilike(SkuTable.skuDescription, term)
                    )!
                );
            }

            const baseQuery = db
                .select({
                    skuId: SkuTable.skuId,
                    skuCode: SkuTable.skuCode,
                    skuDescription: SkuTable.skuDescription,
                    openingQty: InventoryBalancesTable.onHandQty,
                    openingLossQty: InventoryBalancesTable.lossQty,
                    onHandQty: InventoryBalancesTable.onHandQty,
                    reservedQty: InventoryBalancesTable.reservedQty,
                    lossQty: InventoryBalancesTable.lossQty,
                    skuExpiryDate: SkuTable.skuExpiryDate,
                    qtyDifference: sql<number>`0`,
                    lossQtyDifference: sql<number>`0`,
                })
                .from(SkuTable)
                .leftJoin(InventoryBalancesTable, eq(SkuTable.skuId, InventoryBalancesTable.skuId))
                .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

            const pageSize = paginationParams.pageSize || 10;
            const pageNumber = paginationParams.pageNumber || 1;
            const totalCount = (await baseQuery).length;
            const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
            const data = await paginatedQuery.query;

            return { query: data, pagination: paginatedQuery.pagination };
        } catch (error) {
            logger.error('❌ [StockCountServices.getStockCount] Error:', error);
            throw error;
        }
    }
}
