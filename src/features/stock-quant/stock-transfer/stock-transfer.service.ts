/**
 * Stock Transfer Service
 *
 * @description Orchestrates bin-to-bin (B2B) and warehouse-to-warehouse (W2W)
 * stock transfers. Reuses putaway move mechanics with the gaps fixed:
 *  - reserved-qty aware debit (StockQuantRepository.debitStockQuantIfAvailable)
 *  - warehouse-aware type derivation (RacksRepository.getRackWarehouseIds)
 *  - writes inventory_movements (TRANSFER_OUT / TRANSFER_IN) + stock_quant_transaction
 *
 * Invariant preserved: SUM(stock_quant.qty) + SUM(IN_TRANSIT transfer item qty)
 * is constant per SKU/org. A B2B transfer debits source and credits dest in the
 * same transaction (sum unchanged). A W2W transfer debits source on dispatch
 * (stock now lives in the in-transit document) and credits dest on receive.
 *
 * Org-level inventory_balances are never touched: TRANSFER_OUT / TRANSFER_IN are
 * balance no-ops (see inventory.repository.ts) because balances are org+SKU level
 * and rack-to-rack moves don't change org totals.
 *
 * The caller (resolver, Step 4) is responsible for wrapping each method in a
 * db.transaction and passing the resulting `tx`. All work for a single transfer
 * happens inside one transaction so it is atomic.
 */

import { and, eq } from "drizzle-orm";
import type { DbTransaction } from "@/types/db-transaction";
import { logger } from "@/util/logger";
import { InventoryMovementType } from "@/features/inventory/inventory-movement/inventory.model";
import type {
  InventoryMovementRepositoryClass,
  InventoryMovementsInsertType,
} from "@/features/inventory/inventory-movement/inventory.repository";
import type { RacksRepositoryClass } from "@/features/master-data/racks.repository";
import type { StockQuantRepositoryClass } from "../stock-quant.repository";
import type { StockQuantTransactionRepositoryClass } from "../stock-quant-transaction/stock-quant-transaction.repository";
import type { StockTransferRepositoryClass } from "./stock-transfer.repository";
import {
  STOCK_TRANSFER_STATUS,
  STOCK_TRANSFER_TYPE,
  StockTransfersTable,
  type StockTransferItemType,
  type StockTransferType,
  type StockTransferTypeValue,
} from "./stock-transfer.model";

// stock_quant_transaction.type values for the two transfer legs.
const TRANSFER_OUT_TXN_TYPE = "TRANSFER_OUT";
const TRANSFER_IN_TXN_TYPE = "TRANSFER_IN";

/** A single line on a create-transfer request. */
export type CreateTransferLineInput = {
  /** Snapshot id of the source stock_quant row to debit. */
  sourceStockQuantId: string;
  /** Destination rack to credit (must differ from the source rack). */
  destinationRackId: string;
  /** Carton quantity to move (string; numeric columns are strings). May be "0" when moving loose only. */
  quantity: string;
  /** Loose (LOSS) units to move. Defaults to "0". */
  lossQuantity?: string | null;
};

export type CreateTransferInput = {
  lines: CreateTransferLineInput[];
  remarks?: string | null;
};

export type StockTransferWithItems = StockTransferType & {
  items: StockTransferItemType[];
};

/** Internal: a fully-resolved line ready to execute. */
type ResolvedLine = {
  sourceStockQuantId: string;
  skuId: string;
  sourceRackId: string;
  destinationRackId: string;
  lotNo: string | null;
  expiryDate: Date | null;
  description: string | null;
  quantity: string;
  lossQuantity: string;
};

function normalizeLot(lot: string | null | undefined): string | null {
  const trimmed = (lot ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function parseNonNegativeQty(raw: string | null | undefined, field: string): number {
  const n = Number(String(raw ?? "0").trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${field} must be a non-negative number.`);
  }
  return n;
}

function parseTransferLineQuantities(
  quantityRaw: string | null | undefined,
  lossQuantityRaw: string | null | undefined,
): { quantity: string; lossQuantity: string } {
  const cartonQty = parseNonNegativeQty(quantityRaw, "Quantity");
  const lossQty = parseNonNegativeQty(lossQuantityRaw, "Loss quantity");
  if (cartonQty <= 0 && lossQty <= 0) {
    throw new Error("At least one of quantity or loss quantity must be greater than zero.");
  }
  return {
    quantity: cartonQty.toFixed(2),
    lossQuantity: lossQty.toFixed(2),
  };
}

function availableCartonQty(source: { quantity: string; reservedQty: string }): number {
  const onHand = Number(source.quantity);
  const reserved = Number(source.reservedQty);
  const available = onHand - reserved;
  return Number.isFinite(available) ? available : 0;
}

function availableLossQty(source: { lossQty?: string | null }): number {
  const n = Number(source.lossQty ?? "0");
  return Number.isFinite(n) ? n : 0;
}

/** Stable key for duplicate (source, dest, sku, lot, expiry) detection. */
function lineDedupeKey(line: ResolvedLine): string {
  const exp = line.expiryDate ? line.expiryDate.toISOString().slice(0, 10) : "";
  return [
    line.sourceRackId,
    line.destinationRackId,
    line.skuId,
    line.lotNo ?? "",
    exp,
  ].join("|");
}

export class StockTransferServiceClass {
  constructor(
    private readonly stockTransferRepository: StockTransferRepositoryClass,
    private readonly stockQuantRepository: StockQuantRepositoryClass,
    private readonly stockQuantTransactionRepository: StockQuantTransactionRepositoryClass,
    private readonly inventoryMovementRepository: InventoryMovementRepositoryClass,
    private readonly racksRepository: RacksRepositoryClass,
  ) {}

  // ============================================
  // CREATE DRAFT
  // ============================================

  /**
   * Validate and persist a stock transfer draft. No stock movement until approved.
   */
  async createTransferDraft(
    input: CreateTransferInput,
    tx: DbTransaction,
    userId: string,
    organizationId: string,
  ): Promise<StockTransferWithItems> {
    const resolved = await this.resolveTransferLines(input, organizationId, tx);
    const { type, sourceWarehouseId, destinationWarehouseId } =
      await this.deriveTransferType(resolved, organizationId, tx);

    const transferNo = await this.stockTransferRepository.generateTransferNo(tx);

    const header = await this.stockTransferRepository.createStockTransfer(
      {
        organizationId,
        transferNo,
        type,
        status: STOCK_TRANSFER_STATUS.DRAFT,
        sourceWarehouseId,
        destinationWarehouseId,
        remarks: input.remarks ?? null,
        dispatchedAt: null,
        receivedAt: null,
        receivedBy: null,
        createdBy: userId,
        updatedBy: userId,
      },
      tx,
    );

    const items = await this.stockTransferRepository.createStockTransferItems(
      resolved.map((line) => ({
        stockTransferId: header.id,
        skuId: line.skuId,
        lotNo: line.lotNo,
        expiryDate: line.expiryDate,
        quantity: line.quantity,
        lossQuantity: line.lossQuantity,
        sourceRackId: line.sourceRackId,
        destinationRackId: line.destinationRackId,
        sourceStockQuantId: line.sourceStockQuantId,
        createdBy: userId,
      })),
      tx,
    );

    logger.info("✅ [StockTransferService.createTransferDraft] Created draft", {
      transferNo,
      type,
      lines: items.length,
    });

    return { ...header, items };
  }

  // ============================================
  // APPROVE DRAFT
  // ============================================

  /**
   * Approve a draft transfer.
   * B2B → debits source, status IN_TRANSIT (dest credited on receive).
   * W2W → AWAITING_DISPATCH with no stock movement (source debited on dispatch).
   */
  async approveTransfer(
    id: string,
    organizationId: string,
    userId: string,
    tx: DbTransaction,
  ): Promise<StockTransferWithItems> {
    const header = await this.stockTransferRepository.getStockTransferById(
      id,
      organizationId,
      tx,
      true,
    );
    if (!header) {
      throw new Error(`Stock transfer not found (id=${id}).`);
    }
    if (header.status !== STOCK_TRANSFER_STATUS.DRAFT) {
      throw new Error(
        `Only draft transfers can be approved (current status: ${header.status}).`,
      );
    }

    const items = await this.stockTransferRepository.getStockTransferItems(id, tx);

    if (header.type === STOCK_TRANSFER_TYPE.WAREHOUSE_TO_WAREHOUSE) {
      await this.resolveStoredLinesForApproval(items, organizationId, tx);

      const finalHeader = await this.patchHeaderStatus(
        id,
        organizationId,
        {
          status: STOCK_TRANSFER_STATUS.AWAITING_DISPATCH,
          dispatchedAt: null,
          receivedAt: null,
          receivedBy: null,
          updatedBy: userId,
        },
        tx,
      );

      logger.info("✅ [StockTransferService.approveTransfer] Approved W2W (awaiting dispatch)", {
        transferNo: header.transferNo,
        status: STOCK_TRANSFER_STATUS.AWAITING_DISPATCH,
      });

      return { ...finalHeader, items };
    }

    const resolved = await this.resolveStoredLinesForApproval(items, organizationId, tx);
    const now = new Date();

    await this.executeTransferMovements(
      resolved,
      header.transferNo,
      false,
      organizationId,
      userId,
      tx,
    );

    const finalHeader = await this.patchHeaderStatus(
      id,
      organizationId,
      {
        status: STOCK_TRANSFER_STATUS.IN_TRANSIT,
        dispatchedAt: now,
        receivedAt: null,
        receivedBy: null,
        updatedBy: userId,
      },
      tx,
    );

    logger.info("✅ [StockTransferService.approveTransfer] Approved B2B", {
      transferNo: header.transferNo,
      status: STOCK_TRANSFER_STATUS.IN_TRANSIT,
    });

    return { ...finalHeader, items };
  }

  // ============================================
  // DISPATCH (W2W)
  // ============================================

  /**
   * Dispatch a W2W transfer awaiting dispatch: debit source, set IN_TRANSIT.
   */
  async dispatchTransfer(
    id: string,
    organizationId: string,
    userId: string,
    tx: DbTransaction,
  ): Promise<StockTransferWithItems> {
    const header = await this.stockTransferRepository.getStockTransferById(
      id,
      organizationId,
      tx,
      true,
    );
    if (!header) {
      throw new Error(`Stock transfer not found (id=${id}).`);
    }
    if (header.type !== STOCK_TRANSFER_TYPE.WAREHOUSE_TO_WAREHOUSE) {
      throw new Error("Only warehouse-to-warehouse transfers can be dispatched.");
    }
    if (header.status !== STOCK_TRANSFER_STATUS.AWAITING_DISPATCH) {
      throw new Error(
        `Only transfers awaiting dispatch can be dispatched (current status: ${header.status}).`,
      );
    }

    const items = await this.stockTransferRepository.getStockTransferItems(id, tx);
    const resolved = await this.resolveStoredLinesForApproval(items, organizationId, tx);
    const now = new Date();

    await this.executeTransferMovements(
      resolved,
      header.transferNo,
      false,
      organizationId,
      userId,
      tx,
    );

    const finalHeader = await this.patchHeaderStatus(
      id,
      organizationId,
      {
        status: STOCK_TRANSFER_STATUS.IN_TRANSIT,
        dispatchedAt: now,
        updatedBy: userId,
      },
      tx,
    );

    logger.info("✅ [StockTransferService.dispatchTransfer] Dispatched", {
      transferNo: header.transferNo,
      status: STOCK_TRANSFER_STATUS.IN_TRANSIT,
    });

    return { ...finalHeader, items };
  }

  // ============================================
  // REJECT DRAFT
  // ============================================

  /**
   * Reject a draft transfer without moving stock. Marks the document CANCELLED.
   */
  async rejectTransferDraft(
    id: string,
    organizationId: string,
    userId: string,
    tx: DbTransaction,
  ): Promise<StockTransferWithItems> {
    const header = await this.stockTransferRepository.getStockTransferById(
      id,
      organizationId,
      tx,
      true,
    );
    if (!header) {
      throw new Error(`Stock transfer not found (id=${id}).`);
    }
    if (header.status !== STOCK_TRANSFER_STATUS.DRAFT) {
      throw new Error(
        `Only draft transfers can be rejected (current status: ${header.status}).`,
      );
    }

    const items = await this.stockTransferRepository.getStockTransferItems(id, tx);

    const finalHeader = await this.patchHeaderStatus(
      id,
      organizationId,
      {
        status: STOCK_TRANSFER_STATUS.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancelReason: "Rejected before approval",
        updatedBy: userId,
      },
      tx,
    );

    logger.info("✅ [StockTransferService.rejectTransferDraft] Rejected draft", {
      transferNo: header.transferNo,
    });

    return { ...finalHeader, items };
  }

  // ============================================
  // RECEIVE (B2B / W2W)
  // ============================================

  /**
   * Receive an in-transit (B2B or W2W) transfer: credit the destination rack for
   * every line and complete the document. Guards against double-receive by
   * requiring status IN_TRANSIT (loaded FOR UPDATE).
   */
  async receiveTransfer(
    id: string,
    organizationId: string,
    userId: string,
    tx: DbTransaction,
  ): Promise<StockTransferWithItems> {
    const header = await this.stockTransferRepository.getStockTransferById(
      id,
      organizationId,
      tx,
      true,
    );
    if (!header) {
      throw new Error(`Stock transfer not found (id=${id}).`);
    }
    if (header.status !== STOCK_TRANSFER_STATUS.IN_TRANSIT) {
      throw new Error(
        `Only in-transit transfers can be received (current status: ${header.status}).`,
      );
    }

    const items = await this.stockTransferRepository.getStockTransferItems(id, tx);
    if (items.length === 0) {
      throw new Error("Cannot receive a transfer with no line items.");
    }

    for (const item of items) {
      const line = this.itemToLine(item);
      await this.stockQuantRepository.creditStockQuant(
        {
          organizationId,
          skuId: line.skuId,
          rackId: line.destinationRackId,
          lotNo: line.lotNo,
          expiryDate: line.expiryDate,
          qty: line.quantity,
          lossQty: line.lossQuantity,
          userId,
        },
        tx,
      );
      await this.recordIn(line, header.transferNo, organizationId, userId, tx);
    }

    const finalHeader = await this.patchHeaderStatus(
      id,
      organizationId,
      {
        status: STOCK_TRANSFER_STATUS.COMPLETED,
        receivedAt: new Date(),
        receivedBy: userId,
        updatedBy: userId,
      },
      tx,
    );

    logger.info("✅ [StockTransferService.receiveTransfer] Received", {
      transferNo: header.transferNo,
    });

    return { ...finalHeader, items };
  }

  // ============================================
  // CANCEL (B2B / W2W)
  // ============================================

  /**
   * Cancel an in-transit or awaiting-dispatch transfer.
   * AWAITING_DISPATCH → CANCELLED with no stock movement (source never debited).
   * IN_TRANSIT → re-credit SOURCE rack and CANCELLED.
   */
  async cancelTransfer(
    id: string,
    organizationId: string,
    userId: string,
    reason: string,
    tx: DbTransaction,
  ): Promise<StockTransferWithItems> {
    const header = await this.stockTransferRepository.getStockTransferById(
      id,
      organizationId,
      tx,
      true,
    );
    if (!header) {
      throw new Error(`Stock transfer not found (id=${id}).`);
    }
    if (
      header.status !== STOCK_TRANSFER_STATUS.IN_TRANSIT &&
      header.status !== STOCK_TRANSFER_STATUS.AWAITING_DISPATCH
    ) {
      throw new Error(
        `Only in-transit or awaiting-dispatch transfers can be cancelled (current status: ${header.status}).`,
      );
    }

    const items = await this.stockTransferRepository.getStockTransferItems(id, tx);

    if (header.status === STOCK_TRANSFER_STATUS.AWAITING_DISPATCH) {
      const finalHeader = await this.patchHeaderStatus(
        id,
        organizationId,
        {
          status: STOCK_TRANSFER_STATUS.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: userId,
          cancelReason: reason,
          updatedBy: userId,
        },
        tx,
      );

      logger.info("✅ [StockTransferService.cancelTransfer] Cancelled (awaiting dispatch)", {
        transferNo: header.transferNo,
      });

      return { ...finalHeader, items };
    }

    for (const item of items) {
      const line = this.itemToLine(item);
      // Re-credit the SOURCE rack. The original quant row may have been deleted
      // when drained to zero; creditStockQuant upserts so it is recreated.
      await this.stockQuantRepository.creditStockQuant(
        {
          organizationId,
          skuId: line.skuId,
          rackId: line.sourceRackId,
          lotNo: line.lotNo,
          expiryDate: line.expiryDate,
          qty: line.quantity,
          lossQty: line.lossQuantity,
          userId,
        },
        tx,
      );
      // The reversal lands back on the source rack: TRANSFER_IN at source.
      await this.recordIn(
        { ...line, destinationRackId: line.sourceRackId },
        header.transferNo,
        organizationId,
        userId,
        tx,
      );
    }

    const finalHeader = await this.patchHeaderStatus(
      id,
      organizationId,
      {
        status: STOCK_TRANSFER_STATUS.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancelReason: reason,
        updatedBy: userId,
      },
      tx,
    );

    logger.info("✅ [StockTransferService.cancelTransfer] Cancelled", {
      transferNo: header.transferNo,
    });

    return { ...finalHeader, items };
  }

  // ============================================
  // INTERNAL HELPERS
  // ============================================

  /** Resolve and validate create-request lines (no stock movement). */
  private async resolveTransferLines(
    input: CreateTransferInput,
    organizationId: string,
    tx: DbTransaction,
  ): Promise<ResolvedLine[]> {
    if (!input.lines || input.lines.length === 0) {
      throw new Error("A stock transfer must have at least one line.");
    }

    const resolved: ResolvedLine[] = [];
    for (const line of input.lines) {
      const { quantity, lossQuantity } = parseTransferLineQuantities(
        line.quantity,
        line.lossQuantity,
      );

      const source = await this.stockQuantRepository.getStockQuantById(
        organizationId,
        line.sourceStockQuantId,
        tx,
      );
      if (!source) {
        throw new Error(
          `Source stock quant not found (id=${line.sourceStockQuantId}). It may have been removed or transferred already.`,
        );
      }

      if (line.destinationRackId === source.rackId) {
        throw new Error("Destination rack must be different from the source rack.");
      }

      const cartonMove = Number(quantity);
      const lossMove = Number(lossQuantity);
      if (cartonMove > 0 && availableCartonQty(source) < cartonMove) {
        throw new Error(
          `Insufficient available carton stock on source quant (id=${line.sourceStockQuantId}).`,
        );
      }
      if (lossMove > 0 && availableLossQty(source) < lossMove) {
        throw new Error(
          `Insufficient loose stock on source quant (id=${line.sourceStockQuantId}).`,
        );
      }

      resolved.push({
        sourceStockQuantId: source.id,
        skuId: source.skuId,
        sourceRackId: source.rackId,
        destinationRackId: line.destinationRackId,
        lotNo: normalizeLot(source.lotNo),
        expiryDate: source.expiryDate ?? null,
        description: source.description ?? null,
        quantity,
        lossQuantity,
      });
    }

    const seen = new Set<string>();
    for (const line of resolved) {
      const key = lineDedupeKey(line);
      if (seen.has(key)) {
        throw new Error(
          "Duplicate transfer line: same source rack, destination rack, SKU, lot and expiry appears more than once.",
        );
      }
      seen.add(key);
    }

    return resolved;
  }

  /** Re-validate persisted items at approval time and rebuild resolved lines. */
  private async resolveStoredLinesForApproval(
    items: StockTransferItemType[],
    organizationId: string,
    tx: DbTransaction,
  ): Promise<ResolvedLine[]> {
    if (items.length === 0) {
      throw new Error("A stock transfer must have at least one line.");
    }

    const resolved: ResolvedLine[] = [];
    for (const item of items) {
      const { quantity, lossQuantity } = parseTransferLineQuantities(
        item.quantity,
        item.lossQuantity,
      );

      const source = await this.stockQuantRepository.getStockQuantById(
        organizationId,
        item.sourceStockQuantId,
        tx,
      );
      if (!source) {
        throw new Error(
          `Source stock quant not found (id=${item.sourceStockQuantId}). It may have been removed or transferred already.`,
        );
      }

      if (source.rackId !== item.sourceRackId) {
        throw new Error(
          `Source stock quant (id=${item.sourceStockQuantId}) is no longer on the expected rack.`,
        );
      }

      if (item.destinationRackId === source.rackId) {
        throw new Error("Destination rack must be different from the source rack.");
      }

      const cartonMove = Number(quantity);
      const lossMove = Number(lossQuantity);
      if (cartonMove > 0 && availableCartonQty(source) < cartonMove) {
        throw new Error(
          `Insufficient available carton stock on source quant (id=${item.sourceStockQuantId}).`,
        );
      }
      if (lossMove > 0 && availableLossQty(source) < lossMove) {
        throw new Error(
          `Insufficient loose stock on source quant (id=${item.sourceStockQuantId}).`,
        );
      }

      resolved.push({
        sourceStockQuantId: source.id,
        skuId: item.skuId,
        sourceRackId: item.sourceRackId,
        destinationRackId: item.destinationRackId,
        lotNo: normalizeLot(item.lotNo),
        expiryDate: item.expiryDate ?? null,
        description: source.description ?? null,
        quantity,
        lossQuantity,
      });
    }

    return resolved;
  }

  /** Debit source (+ TRANSFER_OUT). When creditDestination is true, also credit dest (+ TRANSFER_IN). */
  private async executeTransferMovements(
    lines: ResolvedLine[],
    transferNo: string,
    creditDestination: boolean,
    organizationId: string,
    userId: string,
    tx: DbTransaction,
  ): Promise<void> {
    for (const line of lines) {
      await this.stockQuantRepository.debitStockQuantIfAvailable(
        organizationId,
        line.sourceStockQuantId,
        line.quantity,
        userId,
        tx,
        line.lossQuantity,
      );

      await this.recordOut(line, transferNo, organizationId, userId, tx);

      if (creditDestination) {
        await this.stockQuantRepository.creditStockQuant(
          {
            organizationId,
            skuId: line.skuId,
            rackId: line.destinationRackId,
            lotNo: line.lotNo,
            expiryDate: line.expiryDate,
            qty: line.quantity,
            lossQty: line.lossQuantity,
            userId,
            description: line.description,
          },
          tx,
        );

        await this.recordIn(line, transferNo, organizationId, userId, tx);
      }
    }
  }

  /**
   * Derive the transfer type from rack→warehouse resolution.
   *  - all sources must resolve to ONE warehouse, all dests to ONE warehouse.
   *  - same warehouse (equal non-null) OR both NULL (unzoned↔unzoned) → B2B.
   *  - different non-null warehouses → W2W.
   *  - exactly one NULL and one non-null → reject (unzoned↔zoned).
   */
  private async deriveTransferType(
    lines: ResolvedLine[],
    organizationId: string,
    tx: DbTransaction,
  ): Promise<{
    type: StockTransferTypeValue;
    sourceWarehouseId: string | null;
    destinationWarehouseId: string | null;
  }> {
    const sourceRackIds = Array.from(new Set(lines.map((l) => l.sourceRackId)));
    const destRackIds = Array.from(new Set(lines.map((l) => l.destinationRackId)));

    const rackToWarehouse = await this.racksRepository.getRackWarehouseIds(
      Array.from(new Set([...sourceRackIds, ...destRackIds])),
      organizationId,
      tx,
    );

    const sourceWarehouseId = this.singleWarehouse(
      sourceRackIds,
      rackToWarehouse,
      "source",
    );
    const destinationWarehouseId = this.singleWarehouse(
      destRackIds,
      rackToWarehouse,
      "destination",
    );

    const srcNull = sourceWarehouseId === null;
    const dstNull = destinationWarehouseId === null;

    // Exactly one side unzoned → ambiguous, reject.
    if (srcNull !== dstNull) {
      throw new Error("rack has no zone/warehouse assigned");
    }

    // Both unzoned, or both in the same warehouse → B2B.
    if ((srcNull && dstNull) || sourceWarehouseId === destinationWarehouseId) {
      return {
        type: STOCK_TRANSFER_TYPE.BIN_TO_BIN,
        sourceWarehouseId,
        destinationWarehouseId,
      };
    }

    // Different non-null warehouses → W2W.
    return {
      type: STOCK_TRANSFER_TYPE.WAREHOUSE_TO_WAREHOUSE,
      sourceWarehouseId,
      destinationWarehouseId,
    };
  }

  /**
   * Resolve a set of rack ids to a single warehouse. Every rack must be present
   * in the map and all racks must share one warehouse value (incl. all NULL).
   */
  private singleWarehouse(
    rackIds: string[],
    rackToWarehouse: Map<string, string | null>,
    side: "source" | "destination",
  ): string | null {
    let resolved: string | null | undefined;
    for (const rackId of rackIds) {
      if (!rackToWarehouse.has(rackId)) {
        throw new Error(`Unknown ${side} rack (id=${rackId}).`);
      }
      const wh = rackToWarehouse.get(rackId) ?? null;
      if (resolved === undefined) {
        resolved = wh;
      } else if (resolved !== wh) {
        throw new Error(`mixed ${side} warehouses`);
      }
    }
    return resolved ?? null;
  }

  /** Write the TRANSFER_OUT inventory_movement + stock_quant_transaction for a line. */
  private async recordOut(
    line: ResolvedLine | LineLike,
    transferNo: string,
    organizationId: string,
    userId: string,
    tx: DbTransaction,
  ): Promise<void> {
    const movement: InventoryMovementsInsertType = {
      skuId: line.skuId,
      movementType: InventoryMovementType.TRANSFER_OUT,
      quantity: line.quantity,
      referenceNo: transferNo,
      rackId: line.sourceRackId,
      lotNo: line.lotNo,
      expiryDate: line.expiryDate,
      reason: "Stock Transfer (out)",
      createdBy: userId,
    };
    await this.inventoryMovementRepository.createInventoryMovement(
      movement,
      userId,
      organizationId,
      tx,
    );

    await this.stockQuantTransactionRepository.createStockQuantTransaction(
      {
        skuId: line.skuId,
        lotNo: line.lotNo,
        expiryDate: line.expiryDate,
        description: transferNo,
        quantity: line.quantity,
        sourceRackId: line.sourceRackId,
        destinationRackId: line.destinationRackId,
        type: TRANSFER_OUT_TXN_TYPE,
        organizationId,
        createdBy: userId,
        updatedBy: userId,
      },
      tx,
    );
  }

  /** Write the TRANSFER_IN inventory_movement + stock_quant_transaction for a line. */
  private async recordIn(
    line: ResolvedLine | LineLike,
    transferNo: string,
    organizationId: string,
    userId: string,
    tx: DbTransaction,
  ): Promise<void> {
    const movement: InventoryMovementsInsertType = {
      skuId: line.skuId,
      movementType: InventoryMovementType.TRANSFER_IN,
      quantity: line.quantity,
      referenceNo: transferNo,
      rackId: line.destinationRackId,
      lotNo: line.lotNo,
      expiryDate: line.expiryDate,
      reason: "Stock Transfer (in)",
      createdBy: userId,
    };
    await this.inventoryMovementRepository.createInventoryMovement(
      movement,
      userId,
      organizationId,
      tx,
    );

    await this.stockQuantTransactionRepository.createStockQuantTransaction(
      {
        skuId: line.skuId,
        lotNo: line.lotNo,
        expiryDate: line.expiryDate,
        description: transferNo,
        quantity: line.quantity,
        sourceRackId: line.sourceRackId,
        destinationRackId: line.destinationRackId,
        type: TRANSFER_IN_TXN_TYPE,
        organizationId,
        createdBy: userId,
        updatedBy: userId,
      },
      tx,
    );
  }

  /** Map a persisted item back to the line shape the record/credit helpers use. */
  private itemToLine(item: StockTransferItemType): LineLike {
    return {
      skuId: item.skuId,
      sourceRackId: item.sourceRackId,
      destinationRackId: item.destinationRackId,
      lotNo: normalizeLot(item.lotNo),
      expiryDate: item.expiryDate ?? null,
      quantity: item.quantity,
      lossQuantity: item.lossQuantity ?? "0",
    };
  }

  /** Patch the transfer header status (terminal transition) inside the tx. */
  private async patchHeaderStatus(
    id: string,
    organizationId: string,
    patch: Partial<StockTransferType>,
    tx: DbTransaction,
  ): Promise<StockTransferType> {
    const [row] = await tx
      .update(StockTransfersTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(StockTransfersTable.id, id),
          eq(StockTransfersTable.organizationId, organizationId),
        ),
      )
      .returning();
    return row;
  }
}

/** Minimal line shape shared by create-time and item-derived flows. */
type LineLike = {
  skuId: string;
  sourceRackId: string;
  destinationRackId: string;
  lotNo: string | null;
  expiryDate: Date | null;
  quantity: string;
  lossQuantity: string;
};
