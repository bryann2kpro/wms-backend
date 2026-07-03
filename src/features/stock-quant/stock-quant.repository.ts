/**
 * Stock quant repository
 *
 * @description Data access for `stock_quant` rows (quantity per SKU and rack).
 */

import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { logger } from "@/util/logger";
import { pagination, PgQueryType } from "@/util/pagination";
import { PaginatedResponse, PaginationParams } from "../rbac/rbac.model";
import { StockQuantTable } from "./stock-quant.model";
import type { DbTransaction } from "@/types/db-transaction";
import { SkuTable } from "../master-data/sku.model";
import { RacksTable } from "../master-data/racks.model";
import { StockUnitTable } from "../master-data/stock-unit.model";

export type StockQuantType = typeof StockQuantTable.$inferSelect;
export type StockQuantInsertType = typeof StockQuantTable.$inferInsert;
export type StockQuantListType = StockQuantType & {
  skuCode: string | null;
  rackLabel: string | null;
  rackBinType: string | null;
  stockUnitCode: string | null;
};

export type StockQuantFilter = {
  id?: string;
  skuId?: string | string[];
  skuCode?: string;
  rackId?: string | string[];
  rackLabel?: string;
};

export type StockQuantPaginatedResult = PaginatedResponse<StockQuantListType> & {
  totalQuantity: string;
};

const stockQuantRackLabelExpr = sql<string | null>`concat_ws('-', ${RacksTable.rackRow}, ${RacksTable.rackLevel}, ${RacksTable.rackColumn})`;

export type StockQuantUpdateInput = {
  description?: string | null;
  quantity?: string;
  reservedQty?: string;
  lossQty?: string;
  rackId?: string;
  updatedBy: string;
};

export class StockQuantRepositoryClass {
  constructor() {}

  async getStockQuants(
    organizationId: string,
    filter: StockQuantFilter,
    paginationParams: PaginationParams,
  ): Promise<StockQuantPaginatedResult> {
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

      if (filter.skuCode?.trim()) {
        conditions.push(ilike(SkuTable.skuCode, `%${filter.skuCode.trim()}%`));
      }

      if (Array.isArray(filter.rackId)) {
        conditions.push(inArray(StockQuantTable.rackId, filter.rackId));
      } else if (filter.rackId) {
        conditions.push(eq(StockQuantTable.rackId, filter.rackId));
      }

      if (filter.rackLabel?.trim()) {
        conditions.push(ilike(stockQuantRackLabelExpr, `%${filter.rackLabel.trim()}%`));
      }

      const whereClause = and(...conditions);

      const baseQuery = db
        .select({
          id: StockQuantTable.id,
          skuId: StockQuantTable.skuId,
          lotNo: StockQuantTable.lotNo,
          expiryDate: StockQuantTable.expiryDate,
          description: StockQuantTable.description,
          quantity: StockQuantTable.quantity,
          reservedQty: StockQuantTable.reservedQty,
          lossQty: StockQuantTable.lossQty,
          rackId: StockQuantTable.rackId,
          organizationId: StockQuantTable.organizationId,
          createdAt: StockQuantTable.createdAt,
          updatedAt: StockQuantTable.updatedAt,
          createdBy: StockQuantTable.createdBy,
          updatedBy: StockQuantTable.updatedBy,
          skuCode: SkuTable.skuCode,
          stockUnitCode: StockUnitTable.unitCode,
          rackLabel: stockQuantRackLabelExpr,
          rackBinType: RacksTable.binType,
        })
        .from(StockQuantTable)
        .leftJoin(SkuTable, eq(SkuTable.skuId, StockQuantTable.skuId))
        .leftJoin(StockUnitTable, eq(StockUnitTable.stockUnitId, SkuTable.skuUom))
        .leftJoin(RacksTable, eq(RacksTable.rackId, StockQuantTable.rackId))
        .where(whereClause)
        .orderBy(desc(StockQuantTable.updatedAt));

      const pageSize = paginationParams.pageSize ?? 20;
      const pageNumber = paginationParams.pageNumber ?? 1;

      const [totalRow, sumRow] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(StockQuantTable)
          .leftJoin(SkuTable, eq(SkuTable.skuId, StockQuantTable.skuId))
          .leftJoin(RacksTable, eq(RacksTable.rackId, StockQuantTable.rackId))
          .where(whereClause),
        db
          .select({
            totalQuantity: sql<string>`coalesce(sum(${StockQuantTable.quantity}::numeric), 0)::text`,
          })
          .from(StockQuantTable)
          .leftJoin(SkuTable, eq(SkuTable.skuId, StockQuantTable.skuId))
          .leftJoin(RacksTable, eq(RacksTable.rackId, StockQuantTable.rackId))
          .where(whereClause),
      ]);

      const totalCount = totalRow[0]?.count ?? 0;
      const totalQuantity = sumRow[0]?.totalQuantity ?? "0";

      const paged = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = (await paged.query) as StockQuantListType[];

      logger.info("✅ [StockQuantRepository.getStockQuants] Done");
      return { query: data, pagination: paged.pagination, totalQuantity };
    } catch (error) {
      logger.error("❌ [StockQuantRepository.getStockQuants]", error);
      throw error;
    }
  }

  async getStockQuantById(
    organizationId: string,
    id: string,
    tx?: DbTransaction,
  ): Promise<StockQuantType | null> {
    try {
      const client = tx ?? db;
      const rows = await client
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

  async listStockQuantsBySkuId(
    organizationId: string,
    skuId: string,
    tx?: DbTransaction,
  ): Promise<StockQuantListType[]> {
    try {
      const client = tx ?? db;
      const rows = await client
        .select({
          id: StockQuantTable.id,
          skuId: StockQuantTable.skuId,
          lotNo: StockQuantTable.lotNo,
          expiryDate: StockQuantTable.expiryDate,
          description: StockQuantTable.description,
          quantity: StockQuantTable.quantity,
          reservedQty: StockQuantTable.reservedQty,
          lossQty: StockQuantTable.lossQty,
          rackId: StockQuantTable.rackId,
          organizationId: StockQuantTable.organizationId,
          createdAt: StockQuantTable.createdAt,
          updatedAt: StockQuantTable.updatedAt,
          createdBy: StockQuantTable.createdBy,
          updatedBy: StockQuantTable.updatedBy,
          skuCode: SkuTable.skuCode,
          stockUnitCode: StockUnitTable.unitCode,
          rackLabel: stockQuantRackLabelExpr,
          rackBinType: RacksTable.binType,
        })
        .from(StockQuantTable)
        .leftJoin(SkuTable, eq(SkuTable.skuId, StockQuantTable.skuId))
        .leftJoin(StockUnitTable, eq(StockUnitTable.stockUnitId, SkuTable.skuUom))
        .leftJoin(RacksTable, eq(RacksTable.rackId, StockQuantTable.rackId))
        .where(
          and(
            eq(StockQuantTable.organizationId, organizationId),
            eq(StockQuantTable.skuId, skuId),
          ),
        )
        .orderBy(desc(StockQuantTable.updatedAt));
      return rows as StockQuantListType[];
    } catch (error) {
      logger.error("❌ [StockQuantRepository.listStockQuantsBySkuId]", error);
      throw error;
    }
  }

  async getStockQuantBySkuAndRack(
    organizationId: string,
    skuId: string,
    rackId: string,
    tx?: DbTransaction,
  ): Promise<StockQuantType | null> {
    return this.getStockQuantBySkuRackAndLot(
      organizationId,
      skuId,
      rackId,
      null,
      tx,
    );
  }

  /**
   * Find stock quant by SKU, rack, and lot. Empty/null lot matches rows without a lot number.
   */
  async getStockQuantBySkuRackAndLot(
    organizationId: string,
    skuId: string,
    rackId: string,
    lotNo: string | null | undefined,
    tx?: DbTransaction,
  ): Promise<StockQuantType | null> {
    try {
      const client = tx ?? db;
      const lotTrimmed = (lotNo ?? "").trim();

      const conditions = [
        eq(StockQuantTable.organizationId, organizationId),
        eq(StockQuantTable.skuId, skuId),
        eq(StockQuantTable.rackId, rackId),
      ];

      if (lotTrimmed === "") {
        conditions.push(
          or(
            isNull(StockQuantTable.lotNo),
            eq(StockQuantTable.lotNo, ""),
            sql`trim(coalesce(${StockQuantTable.lotNo}, '')) = ''`,
          )!,
        );
      } else {
        conditions.push(eq(StockQuantTable.lotNo, lotTrimmed));
      }

      const rows = await client
        .select()
        .from(StockQuantTable)
        .where(and(...conditions))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      logger.error("❌ [StockQuantRepository.getStockQuantBySkuRackAndLot]", error);
      throw error;
    }
  }

  /**
   * Find stock quant by rack → SKU → lot → expiry.
   * Lot and expiry are optional: null/empty incoming values match rows without lot/expiry.
   */
  async getStockQuantByRackSkuLotAndExpiry(
    organizationId: string,
    rackId: string,
    skuId: string,
    lotNo: string | null | undefined,
    expiryDate: Date | null | undefined,
    tx?: DbTransaction,
  ): Promise<StockQuantType | null> {
    try {
      const client = tx ?? db;
      const lotTrimmed = (lotNo ?? "").trim();

      const conditions = [
        eq(StockQuantTable.organizationId, organizationId),
        eq(StockQuantTable.rackId, rackId),
        eq(StockQuantTable.skuId, skuId),
      ];

      if (lotTrimmed === "") {
        conditions.push(
          or(
            isNull(StockQuantTable.lotNo),
            eq(StockQuantTable.lotNo, ""),
            sql`trim(coalesce(${StockQuantTable.lotNo}, '')) = ''`,
          )!,
        );
      } else {
        conditions.push(eq(StockQuantTable.lotNo, lotTrimmed));
      }

      if (expiryDate == null) {
        conditions.push(isNull(StockQuantTable.expiryDate));
      } else {
        const expiryDay = expiryDate.toISOString().slice(0, 10);
        conditions.push(sql`date(${StockQuantTable.expiryDate}) = ${expiryDay}::date`);
      }

      const rows = await client
        .select()
        .from(StockQuantTable)
        .where(and(...conditions))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      logger.error("❌ [StockQuantRepository.getStockQuantByRackSkuLotAndExpiry]", error);
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

  /** All SKUs with on-hand quantity on a rack (for rack capacity / occupancy). */
  async listRackOccupancyByRack(
    organizationId: string,
    rackId: string,
    tx?: DbTransaction,
  ): Promise<
    Array<{
      quantity: number;
      caseExtLengthMm: string | null;
      caseExtWidthMm: string | null;
      caseExtHeightMm: string | null;
      caseGrossWeightKg: string | null;
      casesPerLayer: string | null;
      noOfLayers: string | null;
    }>
  > {
    try {
      const client = tx ?? db;
      const rows = await client
        .select({
          quantity: StockQuantTable.quantity,
          caseExtLengthMm: SkuTable.caseExtLengthMm,
          caseExtWidthMm: SkuTable.caseExtWidthMm,
          caseExtHeightMm: SkuTable.caseExtHeightMm,
          caseGrossWeightKg: SkuTable.caseGrossWeightKg,
          casesPerLayer: SkuTable.casesPerLayer,
          noOfLayers: SkuTable.noOfLayers,
        })
        .from(StockQuantTable)
        .innerJoin(SkuTable, eq(SkuTable.skuId, StockQuantTable.skuId))
        .where(
          and(
            eq(StockQuantTable.organizationId, organizationId),
            eq(StockQuantTable.rackId, rackId),
            sql`${StockQuantTable.quantity}::numeric > 0`,
          ),
        );

      return rows.map((row) => ({
        quantity: Number(row.quantity ?? 0),
        caseExtLengthMm: row.caseExtLengthMm,
        caseExtWidthMm: row.caseExtWidthMm,
        caseExtHeightMm: row.caseExtHeightMm,
        caseGrossWeightKg: row.caseGrossWeightKg,
        casesPerLayer: row.casesPerLayer,
        noOfLayers: row.noOfLayers,
      }));
    } catch (error) {
      logger.error("❌ [StockQuantRepository.listRackOccupancyByRack]", error);
      throw error;
    }
  }

  /** All on-hand occupancy across all racks, grouped by rackId (single query for bulk capacity checks). */
  async listAllRackOccupancy(
    organizationId: string,
    tx?: DbTransaction,
  ): Promise<Map<string, Array<{
    quantity: number;
    caseExtLengthMm: string | null;
    caseExtWidthMm: string | null;
    caseExtHeightMm: string | null;
    caseGrossWeightKg: string | null;
    casesPerLayer: string | null;
    noOfLayers: string | null;
  }>>> {
    try {
      const client = tx ?? db;
      const rows = await client
        .select({
          rackId: StockQuantTable.rackId,
          quantity: StockQuantTable.quantity,
          caseExtLengthMm: SkuTable.caseExtLengthMm,
          caseExtWidthMm: SkuTable.caseExtWidthMm,
          caseExtHeightMm: SkuTable.caseExtHeightMm,
          caseGrossWeightKg: SkuTable.caseGrossWeightKg,
          casesPerLayer: SkuTable.casesPerLayer,
          noOfLayers: SkuTable.noOfLayers,
        })
        .from(StockQuantTable)
        .innerJoin(SkuTable, eq(SkuTable.skuId, StockQuantTable.skuId))
        .where(
          and(
            eq(StockQuantTable.organizationId, organizationId),
            sql`${StockQuantTable.quantity}::numeric > 0`,
          ),
        );

      const map = new Map<string, Array<{
        quantity: number;
        caseExtLengthMm: string | null;
        caseExtWidthMm: string | null;
        caseExtHeightMm: string | null;
        caseGrossWeightKg: string | null;
        casesPerLayer: string | null;
        noOfLayers: string | null;
      }>>();
      for (const row of rows) {
        const entry = {
          quantity: Number(row.quantity ?? 0),
          caseExtLengthMm: row.caseExtLengthMm,
          caseExtWidthMm: row.caseExtWidthMm,
          caseExtHeightMm: row.caseExtHeightMm,
          caseGrossWeightKg: row.caseGrossWeightKg,
          casesPerLayer: row.casesPerLayer,
          noOfLayers: row.noOfLayers,
        };
        const existing = map.get(row.rackId);
        if (existing) {
          existing.push(entry);
        } else {
          map.set(row.rackId, [entry]);
        }
      }
      return map;
    } catch (error) {
      logger.error("❌ [StockQuantRepository.listAllRackOccupancy]", error);
      throw error;
    }
  }

  /** Sum on-hand quantity for a SKU in a rack (all lots/expiry rows). */
  async sumQuantityByRackAndSku(
    organizationId: string,
    rackId: string,
    skuId: string,
    tx?: DbTransaction,
  ): Promise<number> {
    try {
      const client = tx ?? db;
      const [row] = await client
        .select({
          total: sql<string>`coalesce(sum(${StockQuantTable.quantity}::numeric), 0)::text`,
        })
        .from(StockQuantTable)
        .where(
          and(
            eq(StockQuantTable.organizationId, organizationId),
            eq(StockQuantTable.rackId, rackId),
            eq(StockQuantTable.skuId, skuId),
          ),
        );
      const n = Number(row?.total ?? 0);
      return Number.isFinite(n) ? n : 0;
    } catch (error) {
      logger.error("❌ [StockQuantRepository.sumQuantityByRackAndSku]", error);
      throw error;
    }
  }

  /**
   * Atomic conditional debit of a stock_quant row. Decrements `quantity` by `qty`
   * only when the row has enough *available* stock (quantity - reserved_qty >= qty).
   * The guard lives in the UPDATE's WHERE clause so concurrent debits are serialized
   * by the row lock — no read-then-write race. Zero rows updated means the row was
   * missing, belonged to another org, or lacked available stock: an Error is thrown
   * so the caller's transaction aborts.
   *
   * After a successful debit, if the row is fully drained (quantity = 0 AND
   * reserved_qty = 0) it is deleted within the same transaction; the (now-deleted)
   * row is still returned to the caller.
   */
  async debitStockQuantIfAvailable(
    organizationId: string,
    quantId: string,
    qty: string,
    userId: string,
    tx: DbTransaction,
    lossQty = "0",
  ): Promise<StockQuantType> {
    try {
      const cartonDebit = String(qty ?? "0").trim() || "0";
      const lossDebit = String(lossQty ?? "0").trim() || "0";

      const [updated] = await tx
        .update(StockQuantTable)
        .set({
          quantity: sql`${StockQuantTable.quantity} - ${cartonDebit}::numeric`,
          lossQty: sql`${StockQuantTable.lossQty} - ${lossDebit}::numeric`,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(StockQuantTable.id, quantId),
            eq(StockQuantTable.organizationId, organizationId),
            sql`(${StockQuantTable.quantity} - ${StockQuantTable.reservedQty}) >= ${cartonDebit}::numeric`,
            sql`${StockQuantTable.lossQty} >= ${lossDebit}::numeric`,
          ),
        )
        .returning();

      if (!updated) {
        throw new Error(
          `[StockQuantRepository.debitStockQuantIfAvailable] Insufficient available stock or row not found (id=${quantId}, qty=${cartonDebit}, lossQty=${lossDebit})`,
        );
      }

      if (
        Number(updated.quantity) === 0 &&
        Number(updated.reservedQty) === 0 &&
        Number(updated.lossQty) === 0
      ) {
        await tx
          .delete(StockQuantTable)
          .where(
            and(
              eq(StockQuantTable.organizationId, organizationId),
              eq(StockQuantTable.id, quantId),
            ),
          );
      }

      return updated;
    } catch (error) {
      logger.error("❌ [StockQuantRepository.debitStockQuantIfAvailable]", error);
      throw error;
    }
  }

  /**
   * Credit-side upsert keyed by (orgId, skuId, rackId, lotNo, expiryDate). Increments
   * an existing matching row's quantity, or inserts a new row when none exists. Used
   * by the transfer credit side (receive / B2B destination). Quantities are strings
   * to match Drizzle numeric handling.
   */
  async creditStockQuant(
    params: {
      organizationId: string;
      skuId: string;
      rackId: string;
      lotNo?: string | null;
      expiryDate?: Date | null;
      qty: string;
      lossQty?: string | null;
      userId: string;
      description?: string | null;
    },
    tx?: DbTransaction,
  ): Promise<StockQuantType> {
    try {
      const client = tx ?? db;
      const {
        organizationId,
        skuId,
        rackId,
        lotNo,
        expiryDate,
        qty,
        lossQty = "0",
        userId,
        description,
      } = params;
      const cartonCredit = String(qty ?? "0").trim() || "0";
      const lossCredit = String(lossQty ?? "0").trim() || "0";

      const existing = await this.getStockQuantByRackSkuLotAndExpiry(
        organizationId,
        rackId,
        skuId,
        lotNo,
        expiryDate,
        tx,
      );

      if (existing) {
        const [row] = await client
          .update(StockQuantTable)
          .set({
            quantity: sql`${StockQuantTable.quantity} + ${cartonCredit}::numeric`,
            lossQty: sql`${StockQuantTable.lossQty} + ${lossCredit}::numeric`,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(StockQuantTable.organizationId, organizationId),
              eq(StockQuantTable.id, existing.id),
            ),
          )
          .returning();
        return row;
      }

      const lotTrimmed = (lotNo ?? "").trim();
      const [row] = await client
        .insert(StockQuantTable)
        .values({
          organizationId,
          skuId,
          rackId,
          lotNo: lotTrimmed === "" ? null : lotTrimmed,
          expiryDate: expiryDate ?? null,
          description: description ?? null,
          quantity: cartonCredit,
          lossQty: lossCredit,
          reservedQty: "0",
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();
      return row;
    } catch (error) {
      logger.error("❌ [StockQuantRepository.creditStockQuant]", error);
      throw error;
    }
  }
}
