/**
 * Returns Service
 *
 * @description Business logic for Return Management.
 *
 * Flow:
 *  1. Driver captures a return at the outlet during proof-of-delivery
 *     (createReturnForDeliveryOrder, called inside the submitDeliveryProof tx)
 *     or afterwards via the standalone createReturn mutation. NO stock writes —
 *     goods are still on the lorry.
 *  2. Warehouse keeper assigns each item to a rack (assignReturnItemToRack):
 *     - ABOUT_TO_EXPIRE: rack must NOT be in a DAMAGED zone; stock_quant is
 *       credited (merge by sku+rack+lot) and a RETURN_IN movement re-enters
 *       onHand. Original lot/expiry kept so FEFO picks it first.
 *     - DAMAGED: rack MUST be in a DAMAGED zone; NO stock_quant credit
 *       (loadAvailableStockQuants has no zone filter, a quant would be pickable);
 *       a RETURN_DAMAGED movement records the loss.
 *
 * NOTE: this service must NOT import outbound.services (OutboundServices injects
 * this service for the in-tx proof-of-delivery path — importing it back would
 * create a circular dependency).
 */

import { db } from '@/db';
import { logger } from '@/util/logger';
import type { DbTransaction } from '@/types/db-transaction';
import { ReturnsRepositoryClass, ReturnItemWithDetails } from './returns.repository';
import {
  ReturnDocType,
  ReturnItemType,
  ReturnReason,
  ReturnStatus,
  ReturnItemStatus,
} from './returns.model';
import { DeliveryOrdersRepositoryClass } from '@/features/outbound/delivery-orders.repository';
import { DocumentsRepository } from '@/features/documents/documents.repository';
import {
  InventoryMovementRepositoryClass,
  InventoryMovementsInsertType,
} from '@/features/inventory/inventory-movement/inventory.repository';
import { InventoryMovementType } from '@/features/inventory/inventory-movement/inventory.model';
import { StockQuantRepositoryClass } from '@/features/stock-quant/stock-quant.repository';
import {
  normalizedPutawayLotNo,
  qtyPutawayToDbString,
  roundQtyPutaway,
} from '@/features/stock-quant/putaway/putaway-stock-move.service';
import { RacksRepositoryClass } from '@/features/master-data/racks.repository';
import { ZoneRepositoryClass } from '@/features/master-data/zone.repository';

export type ReturnPhotoInput = {
  fileUrl: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
};

export type ReturnLineInput = {
  doItemId?: string | null;
  skuId: string;
  lotNo?: string | null;
  expiryDate?: string | null;
  qtyReturned: string | number;
  reason: string;
  conditionNotes?: string | null;
  photos?: ReturnPhotoInput[] | null;
};

export type CreateReturnData = {
  doId: string;
  items: ReturnLineInput[];
  notes?: string | null;
  userId: string;
  organizationId: string;
};

export type AssignReturnItemToRackData = {
  returnItemId: string;
  rackId: string;
  /** Defaults to the remaining quantity (qtyReturned - qtyPutaway). */
  qty?: string | number | null;
  userId: string;
  organizationId: string;
};

const VALID_REASONS = new Set<string>(Object.values(ReturnReason));

function parseQty(v: string | number | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? roundQtyPutaway(n) : NaN;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value == null || !String(value).trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid expiryDate: ${value}`);
  }
  return d;
}

export class ReturnsServiceClass {
  constructor(
    private readonly returnsRepository: ReturnsRepositoryClass,
    private readonly deliveryOrderRepository: DeliveryOrdersRepositoryClass,
    private readonly documentsRepository: DocumentsRepository,
    private readonly inventoryMovementRepository: InventoryMovementRepositoryClass,
    private readonly stockQuantRepository: StockQuantRepositoryClass,
    private readonly racksRepository: RacksRepositoryClass,
    private readonly zonesRepository: ZoneRepositoryClass,
  ) {}

  /**
   * Create a return document for a delivery order INSIDE a caller-owned transaction.
   * Used by OutboundServices.submitDeliveryProof (same tx as the DELIVERED flip)
   * and by the public createReturn wrapper. No inventory writes here.
   */
  async createReturnForDeliveryOrder(data: CreateReturnData, tx: DbTransaction): Promise<ReturnDocType> {
    logger.info('ℹ️ [ReturnsService.createReturnForDeliveryOrder] Creating return document...');

    if (!data.items?.length) {
      throw new Error('At least one return line is required');
    }

    const doRow = await this.deliveryOrderRepository.getDeliveryOrderById(data.doId);
    if (!doRow) throw new Error('Delivery order not found');

    const existingReturn = await this.returnsRepository.getReturnByDoId(data.doId, tx);
    if (existingReturn) {
      throw new Error(`A return (${existingReturn.returnNo}) already exists for delivery order "${doRow.doNo}".`);
    }

    const doItems = await this.deliveryOrderRepository.getDeliveryOrderItemsForPo(doRow.purchaseOrderId, tx);

    // Delivered qty per SKU (a SKU may appear on multiple DO lines)
    const deliveredQtyBySku = new Map<string, number>();
    for (const item of doItems) {
      deliveredQtyBySku.set(
        item.skuId,
        roundQtyPutaway((deliveredQtyBySku.get(item.skuId) ?? 0) + (parseFloat(item.qtyRequired) || 0)),
      );
    }

    // Validate lines
    const returnedQtyBySku = new Map<string, number>();
    for (const line of data.items) {
      if (!VALID_REASONS.has(line.reason)) {
        throw new Error(`Invalid return reason "${line.reason}". Must be DAMAGED or ABOUT_TO_EXPIRE.`);
      }
      if (!deliveredQtyBySku.has(line.skuId)) {
        throw new Error(`SKU ${line.skuId} is not on delivery order "${doRow.doNo}".`);
      }
      const qty = parseQty(line.qtyReturned);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error('Return quantity must be a positive number.');
      }
      returnedQtyBySku.set(line.skuId, roundQtyPutaway((returnedQtyBySku.get(line.skuId) ?? 0) + qty));
    }
    for (const [skuId, returnedQty] of returnedQtyBySku.entries()) {
      const deliveredQty = deliveredQtyBySku.get(skuId) ?? 0;
      if (returnedQty > deliveredQty) {
        throw new Error(
          `Return quantity for SKU exceeds delivered quantity: returned ${returnedQty}, delivered ${deliveredQty}.`,
        );
      }
    }

    const doItemIdSet = new Set(doItems.map((i) => i.id));
    const returnNo = await this.returnsRepository.generateReturnNo(tx);

    const header = await this.returnsRepository.createReturn(
      {
        organizationId: data.organizationId,
        returnNo,
        doId: doRow.id,
        doNo: doRow.doNo,
        purchaseOrderId: doRow.purchaseOrderId,
        poNo: doRow.poNo,
        status: ReturnStatus.RECEIVED,
        receivedBy: data.userId,
        receivedAt: new Date(),
        notes: data.notes ?? null,
        createdBy: data.userId,
        updatedBy: data.userId,
      },
      tx,
    );

    const items = await this.returnsRepository.createReturnItems(
      data.items.map((line) => ({
        returnId: header.id,
        doItemId: line.doItemId && doItemIdSet.has(line.doItemId) ? line.doItemId : null,
        skuId: line.skuId,
        lotNo: line.lotNo?.trim() ? line.lotNo.trim() : null,
        expiryDate: parseOptionalDate(line.expiryDate),
        qtyReturned: qtyPutawayToDbString(parseQty(line.qtyReturned)),
        reason: line.reason,
        conditionNotes: line.conditionNotes ?? null,
        status: ReturnItemStatus.PENDING,
        qtyPutaway: '0',
        createdBy: data.userId,
        updatedBy: data.userId,
      })),
      tx,
    );

    // Photos — reuse the documents table (same mechanism as SIGNED_DO_PROOF)
    for (let i = 0; i < data.items.length; i++) {
      const photos = data.items[i].photos ?? [];
      for (const photo of photos) {
        await this.documentsRepository.insertDocument(
          {
            docType: 'RETURN_PHOTO',
            refType: 'RETURN_ITEM',
            refId: items[i].id,
            fileName: photo.fileName,
            fileSizeBytes: photo.fileSizeBytes,
            mimeType: photo.mimeType,
            storageKey: photo.fileUrl,
            url: photo.fileUrl,
            uploadedBy: data.userId,
          },
          tx,
        );
      }
    }

    logger.info(`✅ [ReturnsService.createReturnForDeliveryOrder] Return ${returnNo} created with ${items.length} item(s)`);
    return header;
  }

  /**
   * Standalone return capture (escape hatch when the return was missed during
   * proof-of-delivery). DO must already be DELIVERED and have no return yet.
   */
  async createReturn(data: CreateReturnData): Promise<ReturnDocType> {
    logger.info('ℹ️ [ReturnsService.createReturn] Creating standalone return...');
    try {
      const doRow = await this.deliveryOrderRepository.getDeliveryOrderById(data.doId);
      if (!doRow) throw new Error('Delivery order not found');
      if (doRow.status !== 'DELIVERED') {
        throw new Error(`Delivery order must be DELIVERED to capture a return. Current status: "${doRow.status}".`);
      }

      const created = await db.transaction(async (tx) => {
        return this.createReturnForDeliveryOrder(data, tx);
      });

      logger.info('✅ [ReturnsService.createReturn] Return created');
      return created;
    } catch (error) {
      logger.error('❌ [ReturnsService.createReturn] Error:', error);
      throw error;
    }
  }

  /**
   * Warehouse-keeper putaway for one return item (supports partial quantities).
   * This is where stock re-enters the books — see class doc for the semantics.
   */
  async assignReturnItemToRack(data: AssignReturnItemToRackData): Promise<ReturnItemType> {
    logger.info('ℹ️ [ReturnsService.assignReturnItemToRack] Assigning return item to rack...');
    try {
      const updated = await db.transaction(async (tx) => {
        const item = await this.returnsRepository.getReturnItemById(data.returnItemId, tx);
        if (!item) throw new Error('Return item not found');
        if (item.status !== ReturnItemStatus.PENDING) {
          throw new Error(`Return item is already ${item.status}.`);
        }

        const header = await this.returnsRepository.getReturnById(item.returnId, data.organizationId, tx);
        if (!header) throw new Error('Return not found');
        if (header.status !== ReturnStatus.RECEIVED) {
          throw new Error(`Return ${header.returnNo} is already ${header.status}.`);
        }

        const qtyReturned = parseQty(item.qtyReturned);
        const qtyPutaway = parseQty(item.qtyPutaway);
        const remaining = roundQtyPutaway(qtyReturned - qtyPutaway);

        const qty = data.qty == null || String(data.qty).trim() === '' ? remaining : parseQty(data.qty);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error('Putaway quantity must be a positive number.');
        }
        if (qty > remaining) {
          throw new Error(`Putaway quantity exceeds remaining: requested ${qty}, remaining ${remaining}.`);
        }

        // Rack → zone enforcement (deterministic disposition by reason)
        const rack = await this.racksRepository.getRackById(data.rackId, data.organizationId);
        if (!rack) throw new Error('Rack not found or not in your organization.');
        const zone = rack.zoneId ? await this.zonesRepository.getZoneById(rack.zoneId) : null;
        const isDamagedZone = zone?.purpose === 'DAMAGED';

        if (item.reason === ReturnReason.DAMAGED && !isDamagedZone) {
          throw new Error('Damaged returns must be put away to a rack in a DAMAGED zone.');
        }
        if (item.reason === ReturnReason.ABOUT_TO_EXPIRE && isDamagedZone) {
          throw new Error('About-to-expire returns cannot be put away to a DAMAGED zone rack.');
        }

        if (item.reason === ReturnReason.ABOUT_TO_EXPIRE) {
          // Credit stock_quant at the chosen rack (merge by sku+rack+lot, keep
          // original lot/expiry so FEFO picks the returned batch first).
          const lotNo = normalizedPutawayLotNo(item.lotNo);
          const destRow = await this.stockQuantRepository.getStockQuantBySkuRackAndLot(
            data.organizationId,
            item.skuId,
            data.rackId,
            lotNo,
            tx,
          );

          if (destRow) {
            const newQty = roundQtyPutaway(Number(destRow.quantity) + qty);
            await this.stockQuantRepository.updateStockQuant(
              data.organizationId,
              destRow.id,
              { quantity: qtyPutawayToDbString(newQty), updatedBy: data.userId },
              tx,
            );
          } else {
            await this.stockQuantRepository.createStockQuant(
              {
                skuId: item.skuId,
                lotNo,
                expiryDate: item.expiryDate ?? null,
                description: `Return ${header.returnNo}`,
                quantity: qtyPutawayToDbString(qty),
                rackId: data.rackId,
                organizationId: data.organizationId,
                createdBy: data.userId,
                updatedBy: data.userId,
              },
              tx,
            );
          }
        }
        // DAMAGED: deliberately NO stock_quant credit — loadAvailableStockQuants has
        // no zone filter, so a quant on a DAMAGED rack would be pickable for outbound.

        const movement: InventoryMovementsInsertType = {
          skuId: item.skuId,
          movementType:
            item.reason === ReturnReason.ABOUT_TO_EXPIRE
              ? InventoryMovementType.RETURN_IN
              : InventoryMovementType.RETURN_DAMAGED,
          quantity: qtyPutawayToDbString(qty),
          referenceNo: header.returnNo,
          rackId: data.rackId,
          lotNo: item.lotNo ?? null,
          expiryDate: item.expiryDate ?? null,
          reason: item.conditionNotes || `Outlet return (${item.reason})`,
          createdBy: data.userId,
        };
        await this.inventoryMovementRepository.createInventoryMovement(
          [movement],
          data.userId,
          data.organizationId,
          tx,
        );

        const incremented = await this.returnsRepository.incrementReturnItemQtyPutaway(
          item.id,
          qty,
          data.userId,
          tx,
        );
        if (!incremented) throw new Error('Failed to update return item putaway quantity.');

        const newQtyPutaway = parseQty(incremented.qtyPutaway);
        const isFullyAssigned = newQtyPutaway >= qtyReturned;

        const patched = await this.returnsRepository.updateReturnItem(
          item.id,
          {
            assignedRackId: data.rackId,
            assignedBy: data.userId,
            assignedAt: new Date(),
            ...(isFullyAssigned ? { status: ReturnItemStatus.ASSIGNED } : {}),
            updatedBy: data.userId,
          },
          tx,
        );
        if (!patched) throw new Error('Failed to update return item.');

        // Header completes only when every item is fully assigned
        if (isFullyAssigned) {
          const unassigned = await this.returnsRepository.countUnassignedItems(header.id, tx);
          if (unassigned === 0) {
            await this.returnsRepository.updateReturn(
              header.id,
              {
                status: ReturnStatus.COMPLETED,
                completedAt: new Date(),
                updatedBy: data.userId,
              },
              tx,
            );
          }
        }

        return patched;
      });

      logger.info('✅ [ReturnsService.assignReturnItemToRack] Return item assigned');
      return updated;
    } catch (error) {
      logger.error('❌ [ReturnsService.assignReturnItemToRack] Error:', error);
      throw error;
    }
  }

  async getReturnItemsWithDetails(returnId: string): Promise<ReturnItemWithDetails[]> {
    return this.returnsRepository.getReturnItems(returnId);
  }
}
