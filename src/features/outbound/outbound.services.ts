import { db } from "@/db";
import { logger } from "@/util/logger";
import { DbTransaction } from "@/types/db-transaction";
import { invoicesRepository } from "@/composition-root";
import { isWithinMonthEndWindow } from "@/util/date";
import { DeliveryOrdersRepositoryClass, DoItemAllocationWithDetails } from "./delivery-orders.repository";
import { DeliveryOrderItemInsertType, DoItemAllocationInsertType } from "./delivery-orders.model";
import { SkuRepositoryClass } from "../master-data/sku.repository";
import { InventoryBalanceRepositoryClass } from "../inventory/inventory-balance/inventory.repository";
import { DeliveryScheduleRepositoryClass, DeliveryScheduleWithRegion } from "../master-data/delivery-schedule.repository";
import { OutletsRepositoryClass } from "../master-data/outlets.repository";
import { DeliveryOrderType } from "./delivery-orders.model";
import { PurchaseOrdersRepositoryClass } from "./purchase-orders.repository";
import { PurchaseOrderType, PurchaseOrderItemsTable } from "./purchase-orders.model";
import { DocumentsRepository } from "../documents/documents.repository";
import { PickFaceStrategyRepositoryClass } from "../master-data/pick-face-strategy.repository";
import type { ReturnsServiceClass, ReturnLineInput } from "../returns/returns.service";

import { InventoryMovementRepositoryClass, InventoryMovementsInsertType } from "../inventory/inventory-movement/inventory.repository";
import { InventoryMovementType } from "../inventory/inventory-movement/inventory.model";
import {
    assertSufficientStockQuantForLines,
    releaseStockQuantForPurchaseOrder,
    releaseStockQuantPartialForSku,
    reserveStockQuantForPurchaseOrderLine,
    shipStockQuantForPurchaseOrder,
} from "../stock-quant/stock-quant-reservation.service";
import { RegionPricingTable } from "../master-data/region.model";
import { and, eq } from "drizzle-orm";
import { env } from "@/env";

/** Line item input: must have qtyRequired and either skuId or skuCode. */
export type CreateDeliveryOrderItemInput = {
    skuId?: string;
    skuCode?: string;
    qtyRequired: string | number;
};

export type CompleteDeliveryOrderData = {
  userId: string;
  id: string;
};

export type CreatePurchaseOrderItemInput = {
  skuCode: string;
  skuId?: string;
  qtyRequired: number;
  stockQuantId?: string;
};

export type CreatePurchaseOrderData = {
  userId: string;
  organizationId: string;
  purchaseOrderNo: string;
  outletId: string;
  items: CreatePurchaseOrderItemInput[];
  isEmergency?: boolean;
};

export class OutboundServices {
    constructor(
        private readonly deliveryOrderRepository: DeliveryOrdersRepositoryClass,
        private readonly skuRepository: SkuRepositoryClass,
        private readonly inventoryBalanceRepository: InventoryBalanceRepositoryClass,
        private readonly deliveryScheduleRepository: DeliveryScheduleRepositoryClass,
        private readonly outletsRepository: OutletsRepositoryClass,
        private readonly purchaseOrdersRepository: PurchaseOrdersRepositoryClass,
        private readonly inventoryMovementRepository: InventoryMovementRepositoryClass,
        private readonly documentsRepository: DocumentsRepository,
        private readonly pickFaceStrategyRepository?: PickFaceStrategyRepositoryClass,
        // Optional to keep existing tests/wiring working; required for the
        // proof-of-delivery returns capture. ReturnsService must NOT import
        // OutboundServices (circular dependency).
        private readonly returnsService?: ReturnsServiceClass,
    ) {}

    /**
     * Creates a purchase order with automatic delivery order creation.
     * Validates line items, checks stock, computes next delivery date,
     * then creates the PO, DO, and items in a transaction.
     */
    async createPurchaseOrder(data: CreatePurchaseOrderData): Promise<PurchaseOrderType> {
        logger.info("ℹ️ [OutboundServices.createPurchaseOrder] Creating purchase order and delivery order...");
        try {

            const createdBy = data.userId;
            if (!createdBy) {
                logger.error('❌ [InboundServices.createInbound] User ID is required');
                throw new Error('User ID is required');
            }

            const organizationId = data.organizationId;

            let created: PurchaseOrderType | null = null;
            await db.transaction(async (tx) => {
                logger.info('ℹ️ [OutboundServices.createPurchaseOrder] Step 1: Check if skus are in stock...');
                const resolvedLines = await this.resolveAndValidateLineItems(data.items, tx);
                await this.assertSufficientStock(resolvedLines, tx);
                await assertSufficientStockQuantForLines(organizationId, resolvedLines, tx);

                logger.info('ℹ️ [OutboundServices.createPurchaseOrder] Step 2: Compute the next delivery date...');
                const outlet = await this.outletsRepository.getOutletById(data.outletId);
                if (!outlet || !outlet.regionId) {
                    throw new Error('Outlet not found or has no region assigned.');
                }

                const isEmergency = data.isEmergency ?? false;
                const nextDelivery = isEmergency
                    ? await this.computeNextDeliveryDateEmergency(outlet.regionId, new Date())
                    : await this.computeNextDeliveryDate(outlet.regionId, new Date());

                if (!nextDelivery) {
                    throw new Error(`No delivery schedules found for region "${outlet.regionId}".`);
                }
                logger.info(`✅ [OutboundServices.createPurchaseOrder] Next delivery date: ${nextDelivery.deliveryDate.toISOString()} (${nextDelivery.schedule.dayName})${isEmergency ? ' [EMERGENCY]' : ''}`);

                const [regionPricing] = await tx
                    .select({
                        rate: RegionPricingTable.rate,
                        minQty: RegionPricingTable.minQty,
                        sstRate: RegionPricingTable.sstRate,
                    })
                    .from(RegionPricingTable)
                    .where(
                        and(
                            eq(RegionPricingTable.regionId, outlet.regionId),
                            eq(RegionPricingTable.isActive, true),
                        )
                    )
                    .limit(1);

                const rate = regionPricing ? parseFloat(regionPricing.rate) : 0;
                const minQty = regionPricing ? parseFloat(regionPricing.minQty) : 5;
                const sstRate = regionPricing ? parseFloat(regionPricing.sstRate) : 0.06;
                const newPOQty = resolvedLines.reduce((sum, line) => sum + (parseFloat(String(line.qtyRequired)) || 0), 0);

                // --- Group QOM: consolidate with sibling POs for same outlet + delivery date ---
                const siblings = await this.purchaseOrdersRepository.getSiblingPurchaseOrdersWithQty(
                    data.outletId,
                    nextDelivery.deliveryDate,
                    organizationId,
                    data.purchaseOrderNo,
                    tx
                );
                const combinedQty = siblings.reduce((sum, s) => sum + s.totalQty, 0) + newPOQty;
                const combinedEffectiveQty = combinedQty > 0 ? Math.max(combinedQty, minQty) : 0;
                const groupTotalCharge = combinedEffectiveQty * rate * (1 + sstRate);

                const getShareAmount = (qty: number) =>
                    combinedQty > 0 ? (groupTotalCharge * qty) / combinedQty : 0;

                // Update sibling PO amounts to reflect the new group calculation
                for (const sibling of siblings) {
                    const siblingAmount = getShareAmount(sibling.totalQty);
                    await this.purchaseOrdersRepository.updatePurchaseOrder(
                        sibling.id,
                        {
                            amount: siblingAmount.toFixed(2),
                            amountCalcSnapshot: {
                                rate,
                                minQty,
                                sstRate,
                                poQty: sibling.totalQty,
                                combinedQty,
                                combinedEffectiveQty,
                                groupTotalCharge: groupTotalCharge.toFixed(2),
                                minApplied: combinedQty < minQty,
                                deliveryDate: nextDelivery.deliveryDate.toISOString().split('T')[0],
                                siblingPONos: [...siblings.filter(s => s.id !== sibling.id).map(s => s.purchaseOrderNo), data.purchaseOrderNo],
                                updatedByGrouping: true,
                            },
                            updatedBy: data.userId,
                        },
                        organizationId,
                        tx
                    );
                }

                const amount = getShareAmount(newPOQty);
                const amountCalcSnapshot = {
                    rate,
                    minQty,
                    sstRate,
                    poQty: newPOQty,
                    combinedQty,
                    combinedEffectiveQty,
                    groupTotalCharge: groupTotalCharge.toFixed(2),
                    minApplied: combinedQty < minQty,
                    deliveryDate: nextDelivery.deliveryDate.toISOString().split('T')[0],
                    siblingPONos: siblings.map(s => s.purchaseOrderNo),
                };

                logger.info('ℹ️ [OutboundServices.createPurchaseOrder] Step 3: Create Purchase Order...');
                created = await this.purchaseOrdersRepository.createPurchaseOrder(
                    {
                        purchaseOrderNo: data.purchaseOrderNo,
                        outletId: data.outletId,
                        amount: amount.toFixed(2),
                        amountCalcSnapshot,
                        status: "NEW",
                        scheduledDeliveryDate: nextDelivery.deliveryDate,
                        createdBy: data.userId,
                        updatedBy: data.userId,
                        organizationId: organizationId,
                    },
                    tx
                );

                logger.info('ℹ️ [OutboundServices.createPurchaseOrder] Step 4: Create Purchase Order Items...');
                const poItems = data.items.map((item) => ({
                    purchaseOrderNo: data.purchaseOrderNo,
                    skuCode: item.skuCode,
                    qtyRequired: String(item.qtyRequired),
                    createdBy: data.userId,
                    updatedBy: data.userId,
                }));
                await this.purchaseOrdersRepository.createPurchaseOrderItems(poItems, tx);

                logger.info('ℹ️ [OutboundServices.createPurchaseOrder] Step 5: Create Inventory Movements...');
                const inventoryMovements: InventoryMovementsInsertType[] = resolvedLines.map((line) => ({
                    skuId: line.skuId,
                    regionId: outlet.regionId,
                    quantity: line.qtyRequired,
                    movementType: InventoryMovementType.RESERVED,
                    referenceNo: data.purchaseOrderNo,
                    createdBy: data.userId,
                    updatedBy: data.userId,
                }));

                await this.inventoryMovementRepository.createInventoryMovement(inventoryMovements, data.userId, organizationId, tx);

                for (const line of resolvedLines) {
                    await reserveStockQuantForPurchaseOrderLine({
                        organizationId,
                        userId: data.userId,
                        referenceNo: data.purchaseOrderNo,
                        skuId: line.skuId,
                        skuCode: line.skuCode,
                        qtyRequired: line.qtyRequired,
                        stockQuantId: line.stockQuantId,
                        tx,
                    });
                }

                logger.info('ℹ️ [OutboundServices.createPurchaseOrder] Step 6: Automatically Create Delivery Order...');
                const doNo = data.purchaseOrderNo.startsWith('PO') 
                    ? data.purchaseOrderNo.replace('PO', 'DO') 
                    : `DO-${data.purchaseOrderNo}`;

                await this.deliveryOrderRepository.createDeliveryOrder({
                    doNo,
                    purchaseOrderId: created!.id,
                    poNo: data.purchaseOrderNo,
                    status: 'NEW',
                    isEmergency,
                    organizationId: organizationId,
                    createdBy: data.userId,
                    updatedBy: data.userId,
                }, tx);

                logger.info('ℹ️ [OutboundServices.createPurchaseOrder] Step 7: Create Delivery Order Items...');
                const doItemsToInsert: DeliveryOrderItemInsertType[] = resolvedLines.map((line) => ({
                    purchaseOrderId: created!.id,
                    purchaseOrderNo: data.purchaseOrderNo,
                    skuId: line.skuId,
                    qtyRequired: line.qtyRequired,
                    createdBy: data.userId,
                    updatedBy: data.userId,
                }));
                await this.deliveryOrderRepository.createDeliveryOrderItems(doItemsToInsert, tx);
            });
            if (!created) throw new Error("Purchase order was not created.");
            logger.info("✅ [OutboundServices.createPurchaseOrder] Purchase order and Delivery Order created");
            return created;
        } catch (error) {
            logger.error("❌ [OutboundServices.createPurchaseOrder] Error:", error);
            // Drizzle wraps PostgreSQL errors so the PG code/detail lives on error.cause,
            // not on the error itself. Detect unique-constraint violations and convert
            // them into a clean message before the raw SQL leaks to the client.
            const cause = error instanceof Error
                ? (error as unknown as { cause?: { code?: string; constraint?: string } }).cause
                : undefined;
            const isDuplicatePo =
                cause?.code === '23505' &&
                cause?.constraint?.includes('purchase_order_no');
            if (isDuplicatePo) {
                throw new Error(
                    `Purchase order number "${data.purchaseOrderNo}" already exists.`
                );
            }
            throw error;
        }
    }

    /**
     * Marks a delivery order as completed.
     */
    async completeDeliveryOrder(data: CompleteDeliveryOrderData): Promise<DeliveryOrderType> {
        logger.info('ℹ️ [OutboundServices.completeDeliveryOrder] Completing delivery order...');
        try {
            const updated = await this.deliveryOrderRepository.updateDeliveryOrder(
                data.id,
                {
                    status: 'COMPLETED',
                    updatedBy: data.userId,
                },
            );
            logger.info('✅ [OutboundServices.completeDeliveryOrder] Delivery order completed');
            return updated;
        } catch (error) {
            logger.error('❌ [OutboundServices.completeDeliveryOrder] Error:', error);
            throw error;
        }
    }

    /** Allowed delivery order status flow: NEW -> PICKING (warehouse) -> PACKING (all picked) -> SHIPPED -> DELIVERED. */
    static readonly DO_STATUS_FLOW = ['NEW', 'PICKING', 'PACKING', 'SHIPPED', 'DELIVERED'] as const;

    /**
     * Updates a delivery order (e.g. isEmergency, status).
     * Status must follow the flow NEW -> PACKING -> DELIVERED.
     */
    async updateDeliveryOrder(
        id: string,
        data: { isEmergency?: boolean; status?: string; updatedBy: string }
    ): Promise<DeliveryOrderType> {
        logger.info('ℹ️ [OutboundServices.updateDeliveryOrder] Updating delivery order...');
        try {
            const payload: { isEmergency?: boolean; status?: string; updatedBy: string } = {
                updatedBy: data.updatedBy,
            };
            if (data.isEmergency !== undefined) {
                payload.isEmergency = data.isEmergency;
            }
            if (data.status !== undefined) {
                const allowed = OutboundServices.DO_STATUS_FLOW;
                if (!allowed.includes(data.status as typeof allowed[number])) {
                    throw new Error(`Invalid status "${data.status}". Allowed: ${allowed.join(', ')}.`);
                }
                const existing = await this.deliveryOrderRepository.getDeliveryOrderById(id);
                if (!existing) throw new Error('Delivery order not found');
                const effectiveCurrent = existing.status === 'CREATED' ? 'NEW' : existing.status;
                const currentIndex = allowed.indexOf(effectiveCurrent as typeof allowed[number]);
                const nextIndex = allowed.indexOf(data.status as typeof allowed[number]);
                if (currentIndex < 0 || nextIndex !== currentIndex + 1) {
                    throw new Error(`Invalid transition: current status is "${existing.status}", next allowed is "${allowed[currentIndex + 1] ?? 'none'}".`);
                }
                payload.status = data.status;
            }

            const shouldTryCreateInvoice =
                payload.status === "SHIPPED" || payload.status === "DELIVERED";
            const updateTime = new Date();

            const updated = await db.transaction(async (tx) => {
                const updatedDo = await this.deliveryOrderRepository.updateDeliveryOrder(
                    id,
                    payload,
                    undefined,
                    tx,
                );

                if (shouldTryCreateInvoice && isWithinMonthEndWindow(updateTime, { timeZone: "Asia/Kuala_Lumpur", daysFromEndInclusive: 2 })) {
                    try {
                        await invoicesRepository.createInvoiceFromDeliveryOrder(id, tx);
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        if (!message.includes("Invoice already exists for this delivery order")) {
                            throw error;
                        }
                    }
                }

                return updatedDo;
            });

            logger.info('✅ [OutboundServices.updateDeliveryOrder] Delivery order updated');
            return updated;
        } catch (error) {
            logger.error('❌ [OutboundServices.updateDeliveryOrder] Error:', error);
            throw error;
        }
    }

    /**
     * Advances a delivery order to the next step: NEW -> PICKING -> PACKING -> SHIPPED -> DELIVERED.
     * (PICKING is set by allocatePickList when warehouse keeper first checks an item; this advances PICKING -> PACKING when all items are picked.)
     * When DO advances to SHIPPED, the linked Purchase Order is updated to status SHIPPED.
     */
    async advanceDeliveryOrderStatus(data: { id: string; userId: string }): Promise<DeliveryOrderType> {
        logger.info('ℹ️ [OutboundServices.advanceDeliveryOrderStatus] Advancing delivery order status...');
        try {
            const existing = await this.deliveryOrderRepository.getDeliveryOrderById(data.id);
            if (!existing) throw new Error('Delivery order not found');
            const flow = OutboundServices.DO_STATUS_FLOW;
            const effectiveStatus = existing.status === 'CREATED' ? 'NEW' : existing.status;
            const currentIndex = flow.indexOf(effectiveStatus as typeof flow[number]);
            if (currentIndex < 0) {
                throw new Error(`Delivery order has status "${existing.status}". Allowed flow: ${flow.join(' -> ')}.`);
            }
            if (currentIndex >= flow.length - 1) {
                throw new Error('Delivery order is already DELIVERED; no next step.');
            }
            if (effectiveStatus === 'SHIPPED') {
                throw new Error('Delivery order is SHIPPED — upload proof of delivery to mark as DELIVERED.');
            }
            const nextStatus = flow[currentIndex + 1];

            let shipmentMovements: InventoryMovementsInsertType[] = [];
            if (nextStatus === 'SHIPPED') {
                const poResult = await this.purchaseOrdersRepository.getPurchaseOrders(
                    { id: existing.purchaseOrderId },
                    { pageSize: 1, pageNumber: 1 },
                );
                const po = poResult.query[0];
                if (!po) throw new Error('Purchase order not found');

                const outlet = await this.outletsRepository.getOutletById(po.outletId);

                const doItemsResult = await this.deliveryOrderRepository.getDeliveryOrderItemsWithDetails(
                    { purchaseOrderNo: existing.poNo },
                    { pageSize: 1000, pageNumber: 1 },
                );

                shipmentMovements = doItemsResult.query.map((item) => ({
                    skuId: item.skuId as string,
                    regionId: outlet?.regionId ?? undefined,
                    quantity: item.qtyRequired ?? item.qtyPicked,
                    movementType: InventoryMovementType.SHIPMENT,
                    referenceNo: existing.poNo,
                    createdBy: data.userId,
                }));
            }

            let updateTime: Date;
            if (env.NODE_ENV === 'production') {
                updateTime = new Date();
            } else {
                // for testing purposes
                updateTime = new Date('2026-03-30');
            }

            const updated = await db.transaction(async (tx) => {
                const updatedDo = await this.deliveryOrderRepository.updateDeliveryOrder(
                    data.id,
                    {
                        status: nextStatus,
                        updatedBy: data.userId,
                    },
                    undefined,
                    tx,
                );

                if (nextStatus === 'SHIPPED') {
                    await this.purchaseOrdersRepository.updatePurchaseOrder(
                        existing.purchaseOrderId,
                        {
                            status: 'SHIPPED',
                            updatedBy: data.userId,
                        },
                        undefined,
                        tx,
                    );
                    logger.info('✅ [OutboundServices.advanceDeliveryOrderStatus] PO updated to SHIPPED');

                    await this.inventoryMovementRepository.createInventoryMovement(
                        shipmentMovements,
                        data.userId,
                        existing.organizationId,
                        tx,
                    );
                    await shipStockQuantForPurchaseOrder({
                        organizationId: existing.organizationId,
                        userId: data.userId,
                        referenceNo: existing.poNo,
                        tx,
                    });
                    logger.info('✅ [OutboundServices.advanceDeliveryOrderStatus] Inventory movement created for SHIPPED');
                }

                if ((nextStatus === "SHIPPED" || nextStatus === "DELIVERED") && isWithinMonthEndWindow(updateTime, { timeZone: "Asia/Kuala_Lumpur", daysFromEndInclusive: 2 })) {
                    try {
                        await invoicesRepository.createInvoiceFromDeliveryOrder(data.id, tx);
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        if (!message.includes("Invoice already exists for this delivery order")) {
                            throw error;
                        }
                    }
                }

                return updatedDo;
            });

            logger.info(`✅ [OutboundServices.advanceDeliveryOrderStatus] DO status advanced to ${nextStatus}`);
            return updated;
        } catch (error) {
            logger.error('❌ [OutboundServices.advanceDeliveryOrderStatus] Error:', error);
            throw error;
        }
    }

    /**
     * Updates editable fields of an existing purchase order.
     * Editable: notes, scheduledDeliveryDate, outletId, item quantities.
     * PO status, DO status, and createdBy are not touched.
     */
    async updatePurchaseOrder(data: {
        id: string;
        userId: string;
        organizationId: string;
        scheduledDeliveryDate?: string;
        outletId?: string;
        items?: Array<{ id: string; qtyRequired: number }>;
        newItems?: Array<{ skuId: string; skuCode: string; qtyRequired: number }>;
        removedItemIds?: string[];
    }): Promise<PurchaseOrderType> {
        logger.info('ℹ️ [OutboundServices.updatePurchaseOrder] Updating purchase order...');
        try {
            const poResult = await this.purchaseOrdersRepository.getPurchaseOrders(
                { id: data.id },
                { pageSize: 1, pageNumber: 1 }
            );
            const po = poResult.query[0];
            if (!po) throw new Error('Purchase order not found');

            const updated = await db.transaction(async (tx) => {
                const poUpdates: Record<string, unknown> = { updatedBy: data.userId };
                if (data.outletId !== undefined) poUpdates.outletId = data.outletId;
                if (data.scheduledDeliveryDate !== undefined) {
                    poUpdates.scheduledDeliveryDate = new Date(data.scheduledDeliveryDate);
                }

                const updatedPo = await this.purchaseOrdersRepository.updatePurchaseOrder(
                    data.id,
                    poUpdates as any,
                    undefined,
                    tx
                );

                const hasItemChanges =
                    (data.items?.length ?? 0) +
                    (data.newItems?.length ?? 0) +
                    (data.removedItemIds?.length ?? 0) > 0;

                if (hasItemChanges) {
                    // Guard: block item changes if DO is already being picked/packed/shipped
                    const doRow = await this.deliveryOrderRepository.getDeliveryOrderByPurchaseOrderId(po.id);
                    const blockedStatuses = ['PICKING', 'PACKING', 'SHIPPED', 'DELIVERED'];
                    if (doRow && blockedStatuses.includes(doRow.status)) {
                        throw new Error(`Cannot edit items: delivery order is already in status "${doRow.status}"`);
                    }

                    // Resolve outlet for regionId (required for inventory movements)
                    const effectiveOutletId = data.outletId ?? po.outletId;
                    const outlet = await this.outletsRepository.getOutletById(effectiveOutletId);
                    if (!outlet?.regionId) throw new Error('Outlet not found or has no region assigned');

                    // Fetch current PO items (need old qtyRequired to compute delta)
                    const currentPoItems = await tx
                        .select()
                        .from(PurchaseOrderItemsTable)
                        .where(eq(PurchaseOrderItemsTable.purchaseOrderNo, po.purchaseOrderNo));

                    // Fetch DO items with skuCode for matching
                    const doItems = doRow
                        ? await this.deliveryOrderRepository.getDeliveryOrderItemsForPo(po.id, tx)
                        : [];

                    const movementsToCreate: InventoryMovementsInsertType[] = [];

                    // Update existing item quantities
                    for (const itemUpdate of data.items ?? []) {
                        const currentPoItem = currentPoItems.find(i => i.id === itemUpdate.id);
                        if (!currentPoItem) throw new Error(`PO item ${itemUpdate.id} not found`);

                        await this.purchaseOrdersRepository.updatePurchaseOrderItem(
                            itemUpdate.id,
                            { qtyRequired: String(itemUpdate.qtyRequired), updatedBy: data.userId },
                            tx
                        );

                        const doItem = doItems.find(d => d.skuCode === currentPoItem.skuCode);
                        if (doItem) {
                            await this.deliveryOrderRepository.updateDeliveryOrderItem(
                                doItem.id,
                                { qtyRequired: String(itemUpdate.qtyRequired), updatedBy: data.userId },
                                tx
                            );
                            const delta = itemUpdate.qtyRequired - parseFloat(currentPoItem.qtyRequired);
                            if (delta !== 0) {
                                movementsToCreate.push({
                                    skuId: doItem.skuId,
                                    regionId: outlet.regionId,
                                    quantity: String(delta),
                                    movementType: InventoryMovementType.RESERVED,
                                    referenceNo: po.purchaseOrderNo,
                                    createdBy: data.userId,
                                });
                            }
                        }
                    }

                    // Remove items: delete PO item + DO item, release reservation
                    for (const removedPoItemId of data.removedItemIds ?? []) {
                        const currentPoItem = currentPoItems.find(i => i.id === removedPoItemId);
                        if (!currentPoItem) continue;

                        await tx
                            .delete(PurchaseOrderItemsTable)
                            .where(eq(PurchaseOrderItemsTable.id, removedPoItemId));

                        const doItem = doItems.find(d => d.skuCode === currentPoItem.skuCode);
                        if (doItem) {
                            await this.deliveryOrderRepository.deleteDeliveryOrderItem(doItem.id, tx);
                            movementsToCreate.push({
                                skuId: doItem.skuId,
                                regionId: outlet.regionId,
                                quantity: String(-parseFloat(currentPoItem.qtyRequired)),
                                movementType: InventoryMovementType.RESERVED,
                                referenceNo: po.purchaseOrderNo,
                                createdBy: data.userId,
                            });
                        }
                    }

                    // Add new items to PO, DO, and create RESERVED movements
                    if (data.newItems?.length) {
                        await this.purchaseOrdersRepository.createPurchaseOrderItems(
                            data.newItems.map(item => ({
                                purchaseOrderNo: po.purchaseOrderNo,
                                skuCode: item.skuCode,
                                qtyRequired: String(item.qtyRequired),
                                createdBy: data.userId,
                                updatedBy: data.userId,
                            })),
                            tx
                        );

                        if (doRow) {
                            await this.deliveryOrderRepository.createDeliveryOrderItems(
                                data.newItems.map(item => ({
                                    purchaseOrderId: po.id,
                                    purchaseOrderNo: po.purchaseOrderNo,
                                    skuId: item.skuId,
                                    qtyRequired: String(item.qtyRequired),
                                    createdBy: data.userId,
                                    updatedBy: data.userId,
                                })),
                                tx
                            );
                        }

                        for (const item of data.newItems) {
                            movementsToCreate.push({
                                skuId: item.skuId,
                                regionId: outlet.regionId,
                                quantity: String(item.qtyRequired),
                                movementType: InventoryMovementType.RESERVED,
                                referenceNo: po.purchaseOrderNo,
                                createdBy: data.userId,
                            });
                        }
                    }

                    // Batch-create all inventory movements
                    if (movementsToCreate.length > 0) {
                        await this.inventoryMovementRepository.createInventoryMovement(
                            movementsToCreate,
                            data.userId,
                            data.organizationId,
                            tx
                        );

                        for (const movement of movementsToCreate) {
                            const qty = parseFloat(String(movement.quantity));
                            if (!Number.isFinite(qty) || qty === 0) continue;
                            if (qty > 0) {
                                await reserveStockQuantForPurchaseOrderLine({
                                    organizationId: data.organizationId,
                                    userId: data.userId,
                                    referenceNo: po.purchaseOrderNo,
                                    skuId: movement.skuId,
                                    qtyRequired: String(qty),
                                    tx,
                                });
                            } else {
                                await releaseStockQuantPartialForSku({
                                    organizationId: data.organizationId,
                                    userId: data.userId,
                                    referenceNo: po.purchaseOrderNo,
                                    skuId: movement.skuId,
                                    qtyToRelease: String(Math.abs(qty)),
                                    tx,
                                });
                            }
                        }
                    }

                    // Recalculate group QOM amounts for this PO and all siblings.
                    // Must run AFTER all item mutations so the DB reflects the new quantities.
                    const effectiveDeliveryDate = updatedPo.scheduledDeliveryDate
                        ? new Date(updatedPo.scheduledDeliveryDate)
                        : null;

                    if (effectiveDeliveryDate) {
                        const [regionPricing] = await tx
                            .select({
                                rate: RegionPricingTable.rate,
                                minQty: RegionPricingTable.minQty,
                                sstRate: RegionPricingTable.sstRate,
                            })
                            .from(RegionPricingTable)
                            .where(and(
                                eq(RegionPricingTable.regionId, outlet.regionId),
                                eq(RegionPricingTable.isActive, true),
                            ))
                            .limit(1);

                        const rate = regionPricing ? parseFloat(regionPricing.rate) : 0;
                        const minQty = regionPricing ? parseFloat(regionPricing.minQty) : 5;
                        const sstRate = regionPricing ? parseFloat(regionPricing.sstRate) : 0.06;

                        // Re-query this PO's items from DB (reflects all mutations above)
                        const freshPoItems = await tx
                            .select({ qtyRequired: PurchaseOrderItemsTable.qtyRequired })
                            .from(PurchaseOrderItemsTable)
                            .where(eq(PurchaseOrderItemsTable.purchaseOrderNo, po.purchaseOrderNo));
                        const updatedPoQty = freshPoItems.reduce(
                            (sum, i) => sum + (parseFloat(i.qtyRequired) || 0), 0
                        );

                        const allSiblings = await this.purchaseOrdersRepository.getSiblingPurchaseOrdersWithQty(
                            effectiveOutletId,
                            effectiveDeliveryDate,
                            data.organizationId,
                            po.purchaseOrderNo,
                            tx
                        );
                        const combinedQty = allSiblings.reduce((sum, s) => sum + s.totalQty, 0) + updatedPoQty;
                        const combinedEffectiveQty = combinedQty > 0 ? Math.max(combinedQty, minQty) : 0;
                        const groupTotalCharge = combinedEffectiveQty * rate * (1 + sstRate);
                        const getShare = (qty: number) =>
                            combinedQty > 0 ? (groupTotalCharge * qty) / combinedQty : 0;

                        // Update this PO's amount
                        await this.purchaseOrdersRepository.updatePurchaseOrder(
                            po.id,
                            {
                                amount: getShare(updatedPoQty).toFixed(2),
                                amountCalcSnapshot: {
                                    rate, minQty, sstRate,
                                    poQty: updatedPoQty,
                                    combinedQty, combinedEffectiveQty,
                                    groupTotalCharge: groupTotalCharge.toFixed(2),
                                    minApplied: combinedQty < minQty,
                                    deliveryDate: effectiveDeliveryDate.toISOString().split('T')[0],
                                    siblingPONos: allSiblings.map(s => s.purchaseOrderNo),
                                    updatedByGrouping: true,
                                },
                                updatedBy: data.userId,
                            },
                            data.organizationId,
                            tx
                        );

                        // Update sibling amounts
                        for (const sibling of allSiblings) {
                            await this.purchaseOrdersRepository.updatePurchaseOrder(
                                sibling.id,
                                {
                                    amount: getShare(sibling.totalQty).toFixed(2),
                                    amountCalcSnapshot: {
                                        rate, minQty, sstRate,
                                        poQty: sibling.totalQty,
                                        combinedQty, combinedEffectiveQty,
                                        groupTotalCharge: groupTotalCharge.toFixed(2),
                                        minApplied: combinedQty < minQty,
                                        deliveryDate: effectiveDeliveryDate.toISOString().split('T')[0],
                                        siblingPONos: [
                                            ...allSiblings.filter(s => s.id !== sibling.id).map(s => s.purchaseOrderNo),
                                            po.purchaseOrderNo,
                                        ],
                                        updatedByGrouping: true,
                                    },
                                    updatedBy: data.userId,
                                },
                                data.organizationId,
                                tx
                            );
                        }
                    }
                }

                return updatedPo;
            });

            logger.info(`✅ [OutboundServices.updatePurchaseOrder] Purchase order updated`);
            return updated;
        } catch (error) {
            logger.error('❌ [OutboundServices.updatePurchaseOrder] Error:', error);
            throw error;
        }
    }

    /**
     * Cancels a purchase order and its linked delivery order.
     * Releases all inventory reservations and recalculates the QOM group charge
     * for any sibling POs (same outlet + delivery date) that remain active.
     *
     * Guard: POs in SHIPPED or DELIVERED status cannot be cancelled.
     */
    async cancelPurchaseOrder(data: {
        id: string;
        userId: string;
        organizationId: string;
    }): Promise<PurchaseOrderType> {
        logger.info('ℹ️ [OutboundServices.cancelPurchaseOrder] Cancelling purchase order...');
        try {
            const poResult = await this.purchaseOrdersRepository.getPurchaseOrders(
                { id: data.id },
                { pageSize: 1, pageNumber: 1 }
            );
            const po = poResult.query[0];
            if (!po) throw new Error('Purchase order not found');

            if (['SHIPPED', 'DELIVERED'].includes(po.status)) {
                throw new Error(`Purchase order cannot be cancelled: current status is "${po.status}"`);
            }

            const cancelled = await db.transaction(async (tx) => {
                // 1. Resolve region pricing (needed for sibling recalculation)
                const outlet = await this.outletsRepository.getOutletById(po.outletId);
                if (!outlet?.regionId) throw new Error('Outlet not found or has no region assigned');

                const [regionPricing] = await tx
                    .select({
                        rate: RegionPricingTable.rate,
                        minQty: RegionPricingTable.minQty,
                        sstRate: RegionPricingTable.sstRate,
                    })
                    .from(RegionPricingTable)
                    .where(and(
                        eq(RegionPricingTable.regionId, outlet.regionId),
                        eq(RegionPricingTable.isActive, true),
                    ))
                    .limit(1);

                const rate = regionPricing ? parseFloat(regionPricing.rate) : 0;
                const minQty = regionPricing ? parseFloat(regionPricing.minQty) : 5;
                const sstRate = regionPricing ? parseFloat(regionPricing.sstRate) : 0.06;

                // 2. Cancel the PO
                const cancelledPo = await this.purchaseOrdersRepository.updatePurchaseOrder(
                    po.id,
                    { status: 'CANCELLED', updatedBy: data.userId },
                    data.organizationId,
                    tx
                );

                // 3. Cancel the linked DO (bypass service-level status flow guard)
                const doRow = await this.deliveryOrderRepository.getDeliveryOrderByPurchaseOrderId(po.id);
                if (doRow && !['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(doRow.status)) {
                    await this.deliveryOrderRepository.updateDeliveryOrder(
                        doRow.id,
                        { status: 'CANCELLED', updatedBy: data.userId },
                        data.organizationId,
                        tx
                    );
                }

                // 4. Release inventory reservations for all PO items
                const poItems = await tx
                    .select()
                    .from(PurchaseOrderItemsTable)
                    .where(eq(PurchaseOrderItemsTable.purchaseOrderNo, po.purchaseOrderNo));

                if (poItems.length > 0 && doRow) {
                    const doItems = await this.deliveryOrderRepository.getDeliveryOrderItemsForPo(po.id, tx);
                    const releaseMovements: InventoryMovementsInsertType[] = [];

                    for (const poItem of poItems) {
                        const doItem = doItems.find(d => d.skuCode === poItem.skuCode);
                        if (doItem) {
                            releaseMovements.push({
                                skuId: doItem.skuId,
                                regionId: outlet.regionId,
                                quantity: String(-parseFloat(poItem.qtyRequired)),
                                movementType: InventoryMovementType.RESERVED,
                                referenceNo: po.purchaseOrderNo,
                                createdBy: data.userId,
                            });
                        }
                    }

                    if (releaseMovements.length > 0) {
                        await this.inventoryMovementRepository.createInventoryMovement(
                            releaseMovements,
                            data.userId,
                            data.organizationId,
                            tx
                        );
                    }

                    await releaseStockQuantForPurchaseOrder({
                        organizationId: data.organizationId,
                        userId: data.userId,
                        referenceNo: po.purchaseOrderNo,
                        tx,
                    });
                }

                // 5. Recalculate sibling PO amounts — the cancelled PO is now excluded
                //    automatically by the status filter in getSiblingPurchaseOrdersWithQty
                if (po.scheduledDeliveryDate) {
                    const siblings = await this.purchaseOrdersRepository.getSiblingPurchaseOrdersWithQty(
                        po.outletId,
                        new Date(po.scheduledDeliveryDate),
                        data.organizationId,
                        undefined,
                        tx
                    );

                    if (siblings.length > 0) {
                        const combinedQty = siblings.reduce((sum, s) => sum + s.totalQty, 0);
                        const combinedEffectiveQty = combinedQty > 0 ? Math.max(combinedQty, minQty) : 0;
                        const groupTotalCharge = combinedEffectiveQty * rate * (1 + sstRate);
                        const getShareAmount = (qty: number) =>
                            combinedQty > 0 ? (groupTotalCharge * qty) / combinedQty : 0;

                        for (const sibling of siblings) {
                            await this.purchaseOrdersRepository.updatePurchaseOrder(
                                sibling.id,
                                {
                                    amount: getShareAmount(sibling.totalQty).toFixed(2),
                                    amountCalcSnapshot: {
                                        rate,
                                        minQty,
                                        sstRate,
                                        poQty: sibling.totalQty,
                                        combinedQty,
                                        combinedEffectiveQty,
                                        groupTotalCharge: groupTotalCharge.toFixed(2),
                                        minApplied: combinedQty < minQty,
                                        deliveryDate: new Date(po.scheduledDeliveryDate!).toISOString().split('T')[0],
                                        siblingPONos: siblings.filter(s => s.id !== sibling.id).map(s => s.purchaseOrderNo),
                                        updatedByGrouping: true,
                                    },
                                    updatedBy: data.userId,
                                },
                                data.organizationId,
                                tx
                            );
                        }
                    }
                }

                return cancelledPo;
            });

            logger.info(`✅ [OutboundServices.cancelPurchaseOrder] Purchase order ${po.purchaseOrderNo} cancelled`);
            return cancelled;
        } catch (error) {
            logger.error('❌ [OutboundServices.cancelPurchaseOrder] Error:', error);
            throw error;
        }
    }

    /**
     * Applies emergency delivery to an existing purchase order.
     * Re-computes the scheduledDeliveryDate ignoring cutoff rules, moving it to
     * the next available delivery day for the outlet's region.
     */
    async applyEmergencyDelivery(poId: string, userId: string): Promise<PurchaseOrderType> {
        logger.info('ℹ️ [OutboundServices.applyEmergencyDelivery] Applying emergency delivery...');
        try {
            const poResult = await this.purchaseOrdersRepository.getPurchaseOrders(
                { id: poId },
                { pageSize: 1, pageNumber: 1 }
            );
            const po = poResult.query[0];
            if (!po) throw new Error('Purchase order not found');

            const outlet = await this.outletsRepository.getOutletById(po.outletId);
            if (!outlet || !outlet.regionId) throw new Error('Outlet not found or has no region assigned');

            const nextDelivery = await this.computeNextDeliveryDateEmergency(outlet.regionId);
            if (!nextDelivery) throw new Error(`No delivery schedules found for region "${outlet.regionId}"`);

            const updated = await this.purchaseOrdersRepository.updatePurchaseOrder(poId, {
                scheduledDeliveryDate: nextDelivery.deliveryDate,
                updatedBy: userId,
            });
            logger.info(`✅ [OutboundServices.applyEmergencyDelivery] Scheduled delivery updated to ${nextDelivery.deliveryDate.toISOString()}`);
            return updated;
        } catch (error) {
            logger.error('❌ [OutboundServices.applyEmergencyDelivery] Error:', error);
            throw error;
        }
    }

    /**
     * Submit proof of delivery for a SHIPPED delivery order.
     * Saves a signed DO document record and advances DO status to DELIVERED.
     */
    async submitDeliveryProof(data: {
        doId: string;
        fileUrl: string;
        fileName: string;
        fileSizeBytes: number;
        mimeType: string;
        userId: string;
        /** Optional returned goods captured by the driver at the outlet (atomic with the DELIVERED flip). */
        returns?: ReturnLineInput[] | null;
        returnNotes?: string | null;
    }): Promise<DeliveryOrderType> {
        logger.info('ℹ️ [OutboundServices.submitDeliveryProof] Submitting delivery proof...');
        try {
            const existing = await this.deliveryOrderRepository.getDeliveryOrderById(data.doId);
            if (!existing) throw new Error('Delivery order not found');
            const effectiveStatus = existing.status === 'CREATED' ? 'NEW' : existing.status;
            if (effectiveStatus !== 'SHIPPED') {
                throw new Error(`Delivery order must be SHIPPED to submit proof. Current status: "${existing.status}".`);
            }
            if (data.returns?.length && !this.returnsService) {
                throw new Error('Returns capture is not available.');
            }

            const updated = await db.transaction(async (tx) => {
                await this.documentsRepository.insertDocument({
                    docType: 'SIGNED_DO_PROOF',
                    refType: 'DO',
                    refId: data.doId,
                    fileName: data.fileName,
                    fileSizeBytes: data.fileSizeBytes,
                    mimeType: data.mimeType,
                    storageKey: data.fileUrl,
                    url: data.fileUrl,
                    uploadedBy: data.userId,
                });

                const updatedDo = await this.deliveryOrderRepository.updateDeliveryOrder(
                    data.doId,
                    { status: 'DELIVERED', updatedBy: data.userId },
                    undefined,
                    tx,
                );

                // Same tx: the DO is never DELIVERED with the return lost (and vice versa)
                if (data.returns?.length && this.returnsService) {
                    await this.returnsService.createReturnForDeliveryOrder(
                        {
                            doId: data.doId,
                            items: data.returns,
                            notes: data.returnNotes ?? null,
                            userId: data.userId,
                            organizationId: existing.organizationId,
                        },
                        tx,
                    );
                }

                return updatedDo;
            });

            logger.info('✅ [OutboundServices.submitDeliveryProof] DO marked DELIVERED with proof document');
            return updated;
        } catch (error) {
            logger.error('❌ [OutboundServices.submitDeliveryProof] Error:', error);
            throw error;
        }
    }

    /**
     * Computes and stores pick-list allocations for a delivery order.
     * Called when the warehouse keeper begins picking (first checkbox check).
     *
     * For each DO item:
     *  1. Finds all GRN batches for the SKU (with available qty = batch qty - already allocated).
     *  2. Applies priority flag overlay: if only SOME batches are flagged, those go first.
     *     If ALL or NONE are flagged, the flag has no effect.
     *  3. Within each priority group, applies the SKU's picking_strategy (FIFO/LIFO/FEFO).
     *  4. Greedily allocates qty from each batch until qty_required is met.
     *  5. Inserts do_item_allocations rows (replacing any existing ones for this DO).
     *
     * Returns allocations grouped by doItemId.
     */
    async allocatePickList(data: {
        deliveryOrderId: string;
        userId: string;
    }): Promise<Map<string, DoItemAllocationWithDetails[]>> {
        logger.info(`ℹ️ [OutboundServices.allocatePickList] Allocating pick list for DO ${data.deliveryOrderId}...`);
        try {
            const result = await db.transaction(async (tx) => {
                const doRow = await this.deliveryOrderRepository.getDeliveryOrderById(data.deliveryOrderId);
                if (!doRow) throw new Error('Delivery order not found');

                // When warehouse keeper starts picking, move DO from NEW/CREATED to PICKING
                const effectiveStatus = doRow.status === 'CREATED' ? 'NEW' : doRow.status;
                if (effectiveStatus === 'NEW') {
                    await this.deliveryOrderRepository.updateDeliveryOrder(
                        data.deliveryOrderId,
                        { status: 'PICKING', updatedBy: data.userId },
                        undefined,
                        tx,
                    );
                }

                // Get all items for this DO
                const doItemsResult = await this.deliveryOrderRepository.getDeliveryOrderItemsWithDetails(
                    { doNo: doRow.doNo },
                    { pageSize: 1000, pageNumber: 1 }
                );
                const doItems = doItemsResult.query;
                if (doItems.length === 0) return new Map<string, DoItemAllocationWithDetails[]>();

                const doItemIds = doItems.map((i) => i.id);

                // Delete stale allocations before re-computing
                await this.deliveryOrderRepository.deleteDoItemAllocations(doItemIds, tx);

                const allInserts: DoItemAllocationInsertType[] = [];

                for (const doItem of doItems) {
                    const qtyRequired = parseFloat(String(doItem.qtyRequired ?? '0'));
                    if (qtyRequired <= 0) continue;

                    // Get SKU picking strategy
                    const skuResult = await this.skuRepository.getSku(
                        { skuId: doItem.skuId },
                        { pageSize: 1, pageNumber: 1 },
                        tx
                    );
                    const sku = skuResult?.query?.[0];
                    const strategy: string = (sku as (typeof sku & { pickingStrategy?: string }))?.pickingStrategy ?? 'FIFO';

                    // Look up pick face strategy for this SKU — FIXED_BIN overrides batch rack
                    const pickFaceStrategy = this.pickFaceStrategyRepository
                        ? await this.pickFaceStrategyRepository.getActiveBySkuId(doItem.skuId, doRow.organizationId, tx)
                        : null;
                    const pickFaceRackId = pickFaceStrategy?.binType === 'FIXED_BIN'
                        ? pickFaceStrategy.storageBinId
                        : null;

                    // Get GRN batches for this SKU with available qty
                    const grnBatches = await this.deliveryOrderRepository.getGrnItemsWithAvailableQty(
                        doItem.skuId,
                        tx
                    );

                    // Compute available qty per batch
                    const available = grnBatches
                        .map((b) => ({
                            ...b,
                            available: parseFloat(b.qty) - parseFloat(b.allocatedQty),
                        }))
                        .filter((b) => b.available > 0);

                    if (available.length === 0) {
                        logger.warn(`⚠️ [OutboundServices.allocatePickList] No available stock for SKU ${doItem.skuId}`);
                        continue;
                    }

                    // Determine if priority flags are selective (not all-or-none)
                    const flaggedCount = available.filter((b) => b.priorityFlag).length;
                    const useFlag = flaggedCount > 0 && flaggedCount < available.length;

                    // Sort: priority group first, then by strategy within each group
                    const sorted = [...available].sort((a, b) => {
                        if (useFlag) {
                            if (a.priorityFlag && !b.priorityFlag) return -1;
                            if (!a.priorityFlag && b.priorityFlag) return 1;
                        }
                        switch (strategy) {
                            case 'LIFO':
                                return b.createdAt.getTime() - a.createdAt.getTime();
                            case 'FEFO': {
                                const aExp = a.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
                                const bExp = b.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
                                return aExp - bExp;
                            }
                            default: // FIFO
                                return a.createdAt.getTime() - b.createdAt.getTime();
                        }
                    });

                    // Greedy allocation
                    let remaining = qtyRequired;
                    for (const batch of sorted) {
                        if (remaining <= 0) break;
                        const take = Math.min(batch.available, remaining);
                        allInserts.push({
                            doItemId: doItem.id,
                            grnItemId: batch.id,
                            rackId: pickFaceRackId ?? batch.rackId ?? undefined,
                            qtyAllocated: String(take),
                        });
                        remaining -= take;
                    }
                }

                if (allInserts.length > 0) {
                    await this.deliveryOrderRepository.createDoItemAllocations(allInserts, tx);
                }

                // Re-fetch with details for the response (includes doItemId now)
                const withDetails = await this.deliveryOrderRepository.getDoItemAllocationsWithDetails(doItemIds, tx);

                // Group by doItemId
                const byDoItemId = new Map<string, DoItemAllocationWithDetails[]>();
                for (const alloc of withDetails) {
                    const arr = byDoItemId.get(alloc.doItemId) ?? [];
                    arr.push(alloc);
                    byDoItemId.set(alloc.doItemId, arr);
                }

                return byDoItemId;
            });

            logger.info(`✅ [OutboundServices.allocatePickList] Pick list allocated`);
            return result;
        } catch (error) {
            logger.error('❌ [OutboundServices.allocatePickList] Error:', error);
            throw error;
        }
    }

    /**
     * Resolve each line item to skuId (from skuId or skuCode) and validate SKU exists.
     * Returns list of { skuId, qtyRequired, skuCode? } for stock check and downstream use.
     */
    private async resolveAndValidateLineItems(
        items: (DeliveryOrderItemInsertType | CreateDeliveryOrderItemInput | CreatePurchaseOrderItemInput)[],
        tx?: DbTransaction
    ): Promise<{ skuId: string; qtyRequired: string; skuCode?: string; stockQuantId?: string }[]> {
        const resolved: { skuId: string; qtyRequired: string; skuCode?: string; stockQuantId?: string }[] = [];
        for (const item of items) {
            const qtyRequired = String(item.qtyRequired ?? "0");
            let skuId: string | null = "skuId" in item && item.skuId ? item.skuId : null;
            const skuCode = "skuCode" in item ? item.skuCode : undefined;
            const stockQuantId =
                "stockQuantId" in item && item.stockQuantId ? item.stockQuantId : undefined;

            if (!skuId && skuCode) {
                const skuResult = await this.skuRepository.getSku(
                    { skuCode },
                    { pageSize: 1, pageNumber: 1 },
                    tx
                );
                const sku = skuResult?.query?.[0];
                if (sku) skuId = sku.skuId;
            }

            if (!skuId) {
                throw new Error(
                    `Line item missing or invalid SKU: provide either skuId or skuCode. ${skuCode ? `skuCode="${skuCode}" not found.` : ""}`
                );
            }
            resolved.push({ skuId, qtyRequired, skuCode, stockQuantId });
        }
        return resolved;
    }

    /**
     * Throws if any line has required qty greater than available stock (onHand - reserved).
     */
    private async assertSufficientStock(
        lines: { skuId: string; qtyRequired: string; skuCode?: string }[],
        tx?: DbTransaction
    ): Promise<void> {
        if (lines.length === 0) return;
        const skuIds = [...new Set(lines.map((l) => l.skuId))];
        const balances = await this.inventoryBalanceRepository.getInventoryBalanceBySkuIds(skuIds);
        const bySkuId = new Map(balances?.map((b) => [b.skuId, b]) ?? []);

        const parseNum = (v: string | number): number => (typeof v === "number" ? v : parseFloat(String(v)) || 0);

        for (const line of lines) {
            const balance = bySkuId.get(line.skuId);
            const onHand = parseNum(balance?.onHandQty ?? "0");
            const reserved = parseNum(balance?.reservedQty ?? "0");
            const available = onHand - reserved;
            const required = parseNum(line.qtyRequired);

            if (available < required) {
                const label = line.skuCode ?? line.skuId;
                throw new Error(
                    `Insufficient stock for SKU "${label}": required ${required}, available ${available} (onHand: ${onHand}, reserved: ${reserved}).`
                );
            }
        }
    }

    /**
     * Compute the next valid delivery date for a region based on the order time.
     * 
     * Logic:
     * 1. Get all active delivery schedules for the region (supports 2, 3, 4+ delivery days).
     * 2. For each schedule, compute candidate delivery dates (this week and next week).
     * 3. Filter out dates where the cutoff has already passed.
     * 4. Return the earliest valid delivery date across all schedules.
     * 
     * Scales to any number of delivery days per region: add more rows in region_delivery_schedules
     * and the next date is always the earliest valid one.
     * 
     * Example (Klang Valley with Tuesday and Thursday):
     * - Order placed Monday 10:00 → Tuesday (cutoff not passed)
     * - Order placed Monday 14:00 → Thursday (Tuesday cutoff passed)
     * - Order placed Wednesday 20:00 → next Tuesday (both cutoffs passed this week)
     * 
     * @param regionId - The region ID
     * @param orderCreatedAt - When the order was placed (defaults to now)
     * @returns The next valid delivery date, or null if no schedules exist
     */
    async computeNextDeliveryDate(
        regionId: string,
        orderCreatedAt: Date = new Date()
    ): Promise<{ deliveryDate: Date; schedule: DeliveryScheduleWithRegion } | null> {
        const schedules = await this.deliveryScheduleRepository.getSchedulesByRegion(regionId);
        if (schedules.length === 0) return null;

        const candidates: { deliveryDate: Date; schedule: DeliveryScheduleWithRegion }[] = [];

        for (const schedule of schedules) {
            const validDates = this.getValidDeliveryDatesForSchedule(schedule, orderCreatedAt);
            for (const deliveryDate of validDates) {
                candidates.push({ deliveryDate, schedule });
            }
        }

        if (candidates.length === 0) return null;

        candidates.sort((a, b) => a.deliveryDate.getTime() - b.deliveryDate.getTime());
        return candidates[0];
    }

    /**
     * Given a single schedule (one delivery day) and order time, return valid delivery dates
     * where the cutoff has not yet passed. Looks at this week and next week only (enough to
     * always find the next valid date). Used by computeNextDeliveryDate for each schedule.
     */
    private getValidDeliveryDatesForSchedule(
        schedule: DeliveryScheduleWithRegion,
        orderCreatedAt: Date
    ): Date[] {
        const { dayOfWeek, cutoffDaysBefore, cutoffTime } = schedule;
        const now = new Date(orderCreatedAt);
        const validDates: Date[] = [];

        const currentDayOfWeek = now.getDay() === 0 ? 7 : now.getDay();

        let daysUntilDelivery = dayOfWeek - currentDayOfWeek;
        if (daysUntilDelivery <= 0) daysUntilDelivery += 7;

        for (let weekOffset = 0; weekOffset < 2; weekOffset++) {
            const deliveryDate = new Date(now);
            deliveryDate.setDate(now.getDate() + daysUntilDelivery + weekOffset * 7);
            deliveryDate.setHours(0, 0, 0, 0);

            const cutoffDate = new Date(deliveryDate);
            cutoffDate.setDate(cutoffDate.getDate() - (cutoffDaysBefore ?? 1));
            const [hours, minutes] = (cutoffTime ?? '18:00:00').split(':').map(Number);
            cutoffDate.setHours(hours, minutes, 0, 0);

            if (now <= cutoffDate) {
                validDates.push(deliveryDate);
            }
        }

        return validDates;
    }

    /**
     * Compute the next delivery date for emergency orders (bypasses cutoff).
     * Returns the very next delivery day for the region, regardless of cutoff time.
     * 
     * @param regionId - The region ID
     * @param orderCreatedAt - When the order was placed (defaults to now)
     * @returns The next delivery date (ignoring cutoff), or null if no schedules exist
     */
    async computeNextDeliveryDateEmergency(
        regionId: string,
        orderCreatedAt: Date = new Date()
    ): Promise<{ deliveryDate: Date; schedule: DeliveryScheduleWithRegion } | null> {
        const schedules = await this.deliveryScheduleRepository.getSchedulesByRegion(regionId);
        if (schedules.length === 0) return null;

        const candidates: { deliveryDate: Date; schedule: DeliveryScheduleWithRegion }[] = [];

        for (const schedule of schedules) {
            const deliveryDate = this.getNextDeliveryDateForScheduleIgnoringCutoff(schedule, orderCreatedAt);
            candidates.push({ deliveryDate, schedule });
        }

        candidates.sort((a, b) => a.deliveryDate.getTime() - b.deliveryDate.getTime());
        return candidates[0];
    }

    /**
     * Get the next delivery date for a schedule, ignoring cutoff time.
     * Used for emergency deliveries where we want the very next delivery day.
     */
    private getNextDeliveryDateForScheduleIgnoringCutoff(
        schedule: DeliveryScheduleWithRegion,
        orderCreatedAt: Date
    ): Date {
        const { dayOfWeek } = schedule;
        const now = new Date(orderCreatedAt);

        const currentDayOfWeek = now.getDay() === 0 ? 7 : now.getDay();

        let daysUntilDelivery = dayOfWeek - currentDayOfWeek;
        if (daysUntilDelivery <= 0) daysUntilDelivery += 7;

        const deliveryDate = new Date(now);
        deliveryDate.setDate(now.getDate() + daysUntilDelivery);
        deliveryDate.setHours(0, 0, 0, 0);

        return deliveryDate;
    }
}