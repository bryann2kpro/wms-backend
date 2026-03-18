import { and, eq, sql, desc } from "drizzle-orm";
import { db } from "@/db";
import { logger } from "@/util/logger";
import { pagination, PgQueryType } from "@/util/pagination";
import { PaginatedResponse, PaginationParams } from "../rbac/rbac.model";
import {
  StockCountSessionsTable,
  StockCountItemsTable,
  StockCountSessionType,
  StockCountItemType,
} from "./stock-count-session.model";
import { SkuTable } from "../master-data/sku.model";
import { InventoryBalancesTable } from "./inventory-balance/inventory.model";

export type StockCountItemUpdateInput = {
  action?: string | null;
  countedQty?: number | null;
  countedLossQty?: number | null;
  notes?: string | null;
  isApproved?: boolean;
  approvedBy?: string | null;
  approvedAt?: Date | null;
};

export class StockCountSessionRepositoryClass {
  // ─────────────────────────────────────────────
  // LIST SESSIONS
  // ─────────────────────────────────────────────

  async listSessions(
    organizationId: string,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<StockCountSessionType & { itemCount: number; pendingCount: number }>> {
    try {
      const baseQuery = db
        .select({
          id: StockCountSessionsTable.id,
          organizationId: StockCountSessionsTable.organizationId,
          name: StockCountSessionsTable.name,
          status: StockCountSessionsTable.status,
          countDate: StockCountSessionsTable.countDate,
          createdBy: StockCountSessionsTable.createdBy,
          createdAt: StockCountSessionsTable.createdAt,
          closedBy: StockCountSessionsTable.closedBy,
          closedAt: StockCountSessionsTable.closedAt,
          itemCount: sql<number>`(
            SELECT COUNT(*)::int FROM main.stock_count_items sci
            WHERE sci.session_id = ${StockCountSessionsTable.id}
          )`,
          pendingCount: sql<number>`(
            SELECT COUNT(*)::int FROM main.stock_count_items sci
            WHERE sci.session_id = ${StockCountSessionsTable.id}
              AND sci.is_approved = false
          )`,
        })
        .from(StockCountSessionsTable)
        .where(eq(StockCountSessionsTable.organizationId, organizationId))
        .orderBy(desc(StockCountSessionsTable.createdAt));

      const pageSize = paginationParams.pageSize ?? 20;
      const pageNumber = paginationParams.pageNumber ?? 1;
      const totalCount = (await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(StockCountSessionsTable)
        .where(eq(StockCountSessionsTable.organizationId, organizationId)))[0]?.count ?? 0;

      const paged = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paged.query;

      return { query: data as any, pagination: paged.pagination };
    } catch (error) {
      logger.error("[StockCountSessionRepository.listSessions]", error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  // GET SINGLE SESSION WITH ITEMS
  // ─────────────────────────────────────────────

  async getSession(organizationId: string, sessionId: string): Promise<StockCountSessionType | null> {
    try {
      const rows = await db
        .select()
        .from(StockCountSessionsTable)
        .where(
          and(
            eq(StockCountSessionsTable.id, sessionId),
            eq(StockCountSessionsTable.organizationId, organizationId)
          )
        )
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      logger.error("[StockCountSessionRepository.getSession]", error);
      throw error;
    }
  }

  async getSessionItems(
    organizationId: string,
    sessionId: string,
    search: string | undefined,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<StockCountItemType>> {
    try {
      const conditions = [
        eq(StockCountItemsTable.sessionId, sessionId),
        eq(StockCountItemsTable.organizationId, organizationId),
      ];

      if (search?.trim()) {
        const term = `%${search.trim().toLowerCase()}%`;
        conditions.push(
          sql`(lower(${StockCountItemsTable.skuCode}) LIKE ${term} OR lower(${StockCountItemsTable.skuDescription}) LIKE ${term})`
        );
      }

      const whereClause = and(...conditions);

      const countRow = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(StockCountItemsTable)
        .where(whereClause);
      const totalCount = countRow[0]?.count ?? 0;

      const baseQuery = db
        .select()
        .from(StockCountItemsTable)
        .where(whereClause)
        .orderBy(StockCountItemsTable.skuCode);

      const pageSize = paginationParams.pageSize ?? 10;
      const pageNumber = paginationParams.pageNumber ?? 1;
      const paged = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paged.query;

      return { query: data as StockCountItemType[], pagination: paged.pagination };
    } catch (error) {
      logger.error("[StockCountSessionRepository.getSessionItems]", error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  // CREATE SESSION (snapshot)
  // ─────────────────────────────────────────────

  async createSession(
    organizationId: string,
    userId: string,
    name: string
  ): Promise<StockCountSessionType> {
    try {
      return await db.transaction(async (tx) => {
        // 1. Insert the session row
        const [session] = await tx
          .insert(StockCountSessionsTable)
          .values({
            organizationId,
            name,
            status: "open",
            createdBy: userId,
          })
          .returning();

        // 2. Snapshot SKUs × inventory_balances for this org
        const snapshot = await tx
          .select({
            skuId: SkuTable.skuId,
            skuCode: SkuTable.skuCode,
            skuDescription: SkuTable.skuDescription,
            openingQty: SkuTable.cartonQuantity,
            openingLossQty: SkuTable.lossQuantity,
            onHandQty: InventoryBalancesTable.onHandQty,
            onHandLossQty: InventoryBalancesTable.lossQty,
            reservedQty: InventoryBalancesTable.reservedQty,
          })
          .from(SkuTable)
          .leftJoin(
            InventoryBalancesTable,
            eq(SkuTable.skuId, InventoryBalancesTable.skuId)
          )
          .where(eq(SkuTable.organizationId, organizationId));

        if (snapshot.length > 0) {
          const items = snapshot.map((row) => {
            const openingQty = Number(row.openingQty ?? 0);
            const openingLossQty = Number(row.openingLossQty ?? 0);
            const onHandQty = Number(row.onHandQty ?? 0);
            const onHandLossQty = Number(row.onHandLossQty ?? 0);
            const reservedQty = Number(row.reservedQty ?? 0);
            return {
              sessionId: session.id,
              organizationId,
              skuId: row.skuId,
              skuCode: row.skuCode,
              skuDescription: row.skuDescription,
              openingQty: String(openingQty),
              openingLossQty: String(openingLossQty),
              onHandQty: String(onHandQty),
              onHandLossQty: String(onHandLossQty),
              reservedQty: String(reservedQty),
              qtyDifference: String(openingQty - onHandQty),
              lossQtyDifference: String(openingLossQty - onHandLossQty),
            };
          });

          await tx.insert(StockCountItemsTable).values(items);
        }

        return session;
      });
    } catch (error) {
      logger.error("[StockCountSessionRepository.createSession]", error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  // UPDATE ITEM
  // ─────────────────────────────────────────────

  async updateItem(
    organizationId: string,
    itemId: string,
    patch: StockCountItemUpdateInput
  ): Promise<StockCountItemType | null> {
    try {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if ("action" in patch) updateData.action = patch.action;
      if ("countedQty" in patch) updateData.countedQty = patch.countedQty != null ? String(patch.countedQty) : null;
      if ("countedLossQty" in patch) updateData.countedLossQty = patch.countedLossQty != null ? String(patch.countedLossQty) : null;
      if ("notes" in patch) updateData.notes = patch.notes;
      if ("isApproved" in patch) updateData.isApproved = patch.isApproved;
      if ("approvedBy" in patch) updateData.approvedBy = patch.approvedBy;
      if ("approvedAt" in patch) updateData.approvedAt = patch.approvedAt;

      const [updated] = await db
        .update(StockCountItemsTable)
        .set(updateData)
        .where(
          and(
            eq(StockCountItemsTable.id, itemId),
            eq(StockCountItemsTable.organizationId, organizationId)
          )
        )
        .returning();

      return updated ?? null;
    } catch (error) {
      logger.error("[StockCountSessionRepository.updateItem]", error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  // CLOSE SESSION
  // ─────────────────────────────────────────────

  async closeSession(
    organizationId: string,
    sessionId: string,
    userId: string
  ): Promise<StockCountSessionType | null> {
    try {
      const [updated] = await db
        .update(StockCountSessionsTable)
        .set({
          status: "closed",
          closedBy: userId,
          closedAt: new Date(),
        })
        .where(
          and(
            eq(StockCountSessionsTable.id, sessionId),
            eq(StockCountSessionsTable.organizationId, organizationId)
          )
        )
        .returning();

      return updated ?? null;
    } catch (error) {
      logger.error("[StockCountSessionRepository.closeSession]", error);
      throw error;
    }
  }
}
