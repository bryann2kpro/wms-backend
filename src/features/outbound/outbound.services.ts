import { db } from "@/db";
import { logger } from "@/util/logger";
import { DbTransaction } from "@/types/db-transaction";
import { DeliveryOrdersRepositoryClass } from "./delivery-orders.repository";
import { DeliveryOrderItemInsertType } from "./delivery-orders.model";
import { SkuRepositoryClass } from "../master-data/sku.repository";
import { InventoryBalanceRepositoryClass } from "../inventory/inventory-balance/inventory.repository";
import { DeliveryScheduleRepositoryClass, DeliveryScheduleWithRegion } from "../master-data/delivery-schedule.repository";
import { OutletsRepositoryClass } from "../master-data/outlets.repository";
import { DeliveryOrderType } from "./delivery-orders.model";
import { PurchaseOrdersRepositoryClass } from "./purchase-orders.repository";
import { PurchaseOrderType } from "./purchase-orders.model";

import { InventoryMovementRepositoryClass } from "../inventory/inventory-movement/inventory.repository";
import { InventoryMovementType } from "../inventory/inventory-movement/inventory.model";

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
};

export type CreatePurchaseOrderData = {
  userId: string;
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
    ) {}

    /**
     * Creates a purchase order with automatic delivery order creation.
     * Validates line items, checks stock, computes next delivery date,
     * then creates the PO, DO, and items in a transaction.
     */
    async createPurchaseOrder(data: CreatePurchaseOrderData): Promise<PurchaseOrderType> {
        logger.info("ℹ️ [OutboundServices.createPurchaseOrder] Creating purchase order and delivery order...");
        try {
            let created: PurchaseOrderType | null = null;
            await db.transaction(async (tx) => {
                logger.info('ℹ️ [OutboundServices.createPurchaseOrder] Step 1: Check if skus are in stock...');
                const resolvedLines = await this.resolveAndValidateLineItems(data.items, tx);
                await this.assertSufficientStock(resolvedLines, tx);

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

                logger.info('ℹ️ [OutboundServices.createPurchaseOrder] Step 3: Create Purchase Order...');
                created = await this.purchaseOrdersRepository.createPurchaseOrder(
                    {
                        purchaseOrderNo: data.purchaseOrderNo,
                        outletId: data.outletId,
                        status: "NEW",
                        scheduledDeliveryDate: nextDelivery.deliveryDate,
                        createdBy: data.userId,
                        updatedBy: data.userId,
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

                logger.info('ℹ️ [OutboundServices.createPurchaseOrder] Step 5: Automatically Create Delivery Order...');
                const doNo = data.purchaseOrderNo.startsWith('PO') 
                    ? data.purchaseOrderNo.replace('PO', 'DO') 
                    : `DO-${data.purchaseOrderNo}`;

                await this.deliveryOrderRepository.createDeliveryOrder({
                    doNo,
                    purchaseOrderId: created!.id,
                    poNo: data.purchaseOrderNo,
                    isEmergency,
                    createdBy: data.userId,
                    updatedBy: data.userId,
                }, tx);

                logger.info('ℹ️ [OutboundServices.createPurchaseOrder] Step 6: Create Delivery Order Items...');
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
            throw error;
        }
    }

    /**
     * Marks a delivery order as completed.
     */
    async completeDeliveryOrder(data: CompleteDeliveryOrderData): Promise<DeliveryOrderType> {
        logger.info('ℹ️ [OutboundServices.completeDeliveryOrder] Completing delivery order...');
        try {
            const updated = await this.deliveryOrderRepository.updateDeliveryOrder(data.id, {
                status: 'COMPLETED',
                updatedBy: data.userId,
            });
            logger.info('✅ [OutboundServices.completeDeliveryOrder] Delivery order completed');
            return updated;
        } catch (error) {
            logger.error('❌ [OutboundServices.completeDeliveryOrder] Error:', error);
            throw error;
        }
    }

    /**
     * Updates a delivery order (e.g. isEmergency).
     */
    async updateDeliveryOrder(
        id: string,
        data: { isEmergency?: boolean; updatedBy: string }
    ): Promise<DeliveryOrderType> {
        logger.info('ℹ️ [OutboundServices.updateDeliveryOrder] Updating delivery order...');
        try {
            const payload: { isEmergency?: boolean; updatedBy: string } = {
                updatedBy: data.updatedBy,
            };
            if (data.isEmergency !== undefined) {
                payload.isEmergency = data.isEmergency;
            }
            const updated = await this.deliveryOrderRepository.updateDeliveryOrder(id, payload);
            logger.info('✅ [OutboundServices.updateDeliveryOrder] Delivery order updated');
            return updated;
        } catch (error) {
            logger.error('❌ [OutboundServices.updateDeliveryOrder] Error:', error);
            throw error;
        }
    }

    /**
     * Resolve each line item to skuId (from skuId or skuCode) and validate SKU exists.
     * Returns list of { skuId, qtyRequired, skuCode? } for stock check and downstream use.
     */
    private async resolveAndValidateLineItems(
        items: (DeliveryOrderItemInsertType | CreateDeliveryOrderItemInput)[],
        tx?: DbTransaction
    ): Promise<{ skuId: string; qtyRequired: string; skuCode?: string }[]> {
        const resolved: { skuId: string; qtyRequired: string; skuCode?: string }[] = [];
        for (const item of items) {
            const qtyRequired = String(item.qtyRequired ?? "0");
            let skuId: string | null = "skuId" in item && item.skuId ? item.skuId : null;
            const skuCode = "skuCode" in item ? item.skuCode : undefined;

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
            resolved.push({ skuId, qtyRequired, skuCode });
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