import { and, eq, sql, desc, isNull, or } from "drizzle-orm";
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
import { InventoryMovementRepositoryClass } from "./inventory-movement/inventory.repository";
import { InventoryMovementType } from "./inventory-movement/inventory.model";
import { DailyOpeningStockRepositoryClass } from "./daily-opening-stock/daily-opening-stock.repository";
import type { DbTransaction } from "@/types/db-transaction";

export type StockCountItemUpdateInput = {
  action?: string | null;
  countedQty?: number | null;
  countedLossQty?: number | null;
  notes?: string | null;
  imageUrl?: string | null;
  isApproved?: boolean;
  approvedBy?: string | null;
  approvedAt?: Date | null;
};

export class StockCountSessionRepositoryClass {
  constructor(
    private readonly inventoryMovementRepository: InventoryMovementRepositoryClass,
    private readonly dailyOpeningStockRepository: DailyOpeningStockRepositoryClass
  ) {}

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
          // 3. Look up today's opening stock from daily_opening_stock
          const today = new Date();
          const openingMap = await this.dailyOpeningStockRepository.getOpeningForSession(
            organizationId,
            today
          );

          const items = snapshot.map((row) => {
            const onHandQty = Number(row.onHandQty ?? 0);
            const onHandLossQty = Number(row.onHandLossQty ?? 0);
            const reservedQty = Number(row.reservedQty ?? 0);
            const skuId = row.skuId as string;

            // Use daily_opening_stock if available; fall back to inventory_balances
            const dailyOpening = openingMap.get(skuId);
            const openingQty = dailyOpening
              ? Number(dailyOpening.openingQty)
              : onHandQty;
            const openingLossQty = dailyOpening
              ? Number(dailyOpening.openingLossQty)
              : onHandLossQty;

            return {
              sessionId: session.id,
              organizationId,
              skuId,
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
  // PRIVATE: Approval flow
  // ─────────────────────────────────────────────

  /**
   * Compute target qty/loss from item action, write 0–2 inventory movements,
   * then update the item row to isApproved = true.
   *
   * Called from both updateItem (single approve) and bulkApproveReadyItems.
   */
  private async _runApprovalFlow(
    item: StockCountItemType,
    sessionName: string,
    userId: string,
    organizationId: string,
    tx: DbTransaction
  ): Promise<void> {
    const onHandQty = Number(item.onHandQty ?? 0);
    const onHandLossQty = Number(item.onHandLossQty ?? 0);
    const openingQty = Number(item.openingQty ?? 0);
    const openingLossQty = Number(item.openingLossQty ?? 0);
    const countedQty = item.countedQty != null ? Number(item.countedQty) : null;
    const countedLossQty =
      item.countedLossQty != null ? Number(item.countedLossQty) : null;

    // Action → target logic
    let targetQty: number;
    let targetLossQty: number;

    switch (item.action) {
      case "tally_to_opening":
        targetQty = openingQty;
        targetLossQty = openingLossQty;
        break;
      case "tally_to_stock_count":
      case "manual_key_in":
        targetQty = countedQty ?? onHandQty;
        targetLossQty = countedLossQty ?? onHandLossQty;
        break;
      default:
        // null / zero-diff case — no movement needed
        targetQty = onHandQty;
        targetLossQty = onHandLossQty;
        break;
    }

    const qtyDelta = targetQty - onHandQty;
    const lossDelta = targetLossQty - onHandLossQty;
    const reason = `Stock Count - ${item.action ?? "zero_diff"}`;

    // Write ADJUSTMENT movement if qty changed
    if (qtyDelta !== 0) {
      await this.inventoryMovementRepository.createInventoryMovement(
        {
          skuId: item.skuId as string,
          movementType: InventoryMovementType.ADJUSTMENT,
          quantity: String(qtyDelta),
          referenceNo: sessionName,
          reason,
          createdBy: userId,
        },
        userId,
        organizationId,
        tx
      );
    }

    // Write LOSS_ADJUSTMENT movement if loss changed
    if (lossDelta !== 0) {
      await this.inventoryMovementRepository.createInventoryMovement(
        {
          skuId: item.skuId as string,
          movementType: InventoryMovementType.LOSS_ADJUSTMENT,
          quantity: String(lossDelta),
          referenceNo: sessionName,
          reason,
          createdBy: userId,
        },
        userId,
        organizationId,
        tx
      );
    }

    // Mark item approved
    const now = new Date();
    await tx
      .update(StockCountItemsTable)
      .set({
        isApproved: true,
        approvedBy: userId,
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(StockCountItemsTable.id, item.id));
  }

  // ─────────────────────────────────────────────
  // UPDATE ITEM
  // ─────────────────────────────────────────────

  async updateItem(
    organizationId: string,
    itemId: string,
    patch: StockCountItemUpdateInput,
    userId?: string
  ): Promise<StockCountItemType | null> {
    try {
      // If this is an approval request, run the full approval flow
      if (patch.isApproved === true && userId) {
        return await db.transaction(async (tx) => {
          // Fetch current item
          const [currentItem] = await tx
            .select()
            .from(StockCountItemsTable)
            .where(
              and(
                eq(StockCountItemsTable.id, itemId),
                eq(StockCountItemsTable.organizationId, organizationId)
              )
            )
            .limit(1);

          if (!currentItem) return null;

          // Idempotent: skip if already approved
          if (currentItem.isApproved) {
            return currentItem;
          }

          // Fetch session name
          const [session] = await tx
            .select({ name: StockCountSessionsTable.name })
            .from(StockCountSessionsTable)
            .where(eq(StockCountSessionsTable.id, currentItem.sessionId))
            .limit(1);

          const sessionName = session?.name ?? "Stock Count";

          await this._runApprovalFlow(
            currentItem,
            sessionName,
            userId,
            organizationId,
            tx
          );

          // Return updated item
          const [updated] = await tx
            .select()
            .from(StockCountItemsTable)
            .where(eq(StockCountItemsTable.id, itemId))
            .limit(1);

          return updated ?? null;
        });
      }

      // Non-approval patch — simple update
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if ("action" in patch) updateData.action = patch.action;
      if ("countedQty" in patch)
        updateData.countedQty =
          patch.countedQty != null ? String(patch.countedQty) : null;
      if ("countedLossQty" in patch)
        updateData.countedLossQty =
          patch.countedLossQty != null ? String(patch.countedLossQty) : null;
      if ("notes" in patch) updateData.notes = patch.notes;
      if ("imageUrl" in patch) updateData.imageUrl = patch.imageUrl;
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
  // BULK APPROVE READY ITEMS
  // ─────────────────────────────────────────────

  async bulkApproveReadyItems(
    organizationId: string,
    sessionId: string,
    userId: string
  ): Promise<number> {
    try {
      // Fetch session name first
      const [session] = await db
        .select({ name: StockCountSessionsTable.name })
        .from(StockCountSessionsTable)
        .where(eq(StockCountSessionsTable.id, sessionId))
        .limit(1);

      const sessionName = session?.name ?? "Stock Count";

      // Fetch all eligible items: not yet approved, and either has an action set OR zero diff
      const eligibleItems = await db
        .select()
        .from(StockCountItemsTable)
        .where(
          and(
            eq(StockCountItemsTable.sessionId, sessionId),
            eq(StockCountItemsTable.organizationId, organizationId),
            eq(StockCountItemsTable.isApproved, false),
            sql`(
              ${StockCountItemsTable.action} IS NOT NULL
              OR (
                CAST(${StockCountItemsTable.qtyDifference} AS numeric) = 0
                AND CAST(${StockCountItemsTable.lossQtyDifference} AS numeric) = 0
              )
            )`
          )
        );

      if (eligibleItems.length === 0) return 0;

      let approvedCount = 0;

      await db.transaction(async (tx) => {
        for (const item of eligibleItems) {
          // Safety guard: skip if already approved (race condition)
          if (item.isApproved) continue;

          await this._runApprovalFlow(
            item,
            sessionName,
            userId,
            organizationId,
            tx
          );
          approvedCount++;
        }
      });

      return approvedCount;
    } catch (error) {
      logger.error(
        "[StockCountSessionRepository.bulkApproveReadyItems]",
        error
      );
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
