import { GrnItemsRepositoryClass } from "./grns-items.repository";
import { GrnsRepositoryClass } from "./grns.repository";
import { SupplierDeliveryItemsRepositoryClass } from "./supplier-deliveries/supplier-delivery-item.repository";
import { SupplierDeliveriesRepositoryClass } from "./supplier-deliveries/supplier-deliveries.repository";
import { logger } from "@/util/logger";
import { db } from "@/db";
import { SkuRepositoryClass } from "../master-data/sku.repository";
import type { DbTransaction } from "@/types/db-transaction";
import { InventoryMovementType } from "../inventory/inventory-movement/inventory.model";
import { InventoryMovementRepositoryClass } from "../inventory/inventory-movement/inventory.repository";
import { GrnItemRacksTable } from "./grns.model";
import { OrganizationRepositoryClass } from "../master-data/organization.repository";

/**
 * Item input for creating a GRN (same shape as CreateGrnItemInput).
 * Provide skuId to use an existing SKU; or skuCode, skuDescription, skuUom to create a new SKU.
 */
export type CreateInboundItemInput = {
    skuId?: string | null;
    qty: string;
    lossQty?: string | null;
    remarks?: string | null;
    rackId?: string | null;
    rackIds?: string[] | null;
    expiryDate?: string | null;
    skuCode?: string | null;
    skuDescription?: string | null;
    skuUom?: string | null;
};

/**
 * Input for creating an inbound (GRN) – same type and process as createGrn.
 * When inboundQty and skuId are provided, the SKU's cartonQuantity is updated to inboundQty (in same transaction).
 */
export type CreateInboundInput = {
    userId: string;
    organizationId: string;
    grnNo: string;
    supplierId?: string | null;
    supplierDeliveryId?: string | null;
    supplierDeliveryNo?: string | null;
    poNo?: string | null;
    receivedAt?: string | null;
    notes?: string | null;
    proofUrl?: string | null;
    warehouseId?: string | null;
    status?: string | null;
    items?: CreateInboundItemInput[] | null;
    /** When set with skuId, updates that SKU's carton quantity to this value (in same transaction). */
    inboundQty?: number | string | null;
    /** SKU to update when inboundQty is provided. */
    skuId?: string | null;
};

export class InboundServices {
    constructor(
        private readonly grnsRepository: GrnsRepositoryClass,
        private readonly skuRepository: SkuRepositoryClass,
        private readonly supplierDeliveriesRepository: SupplierDeliveriesRepositoryClass,
        private readonly supplierDeliveryItemsRepository: SupplierDeliveryItemsRepositoryClass,
        private readonly grnItemsRepository: GrnItemsRepositoryClass,
        private readonly inventoryMovementRepository: InventoryMovementRepositoryClass,
    ) {}

    /**
     * Create inbound (GRN + items). Same types and process as createGrn:
     * 1. Check duplicate grnNo
     * 2. If supplierDeliveryNo: check duplicate, create supplier delivery, create supplier delivery items from items
     * 3. Create GRN
     * 4. Create GRN items (resolve/create SKU per item, then batch insert)
     */
    async createInbound(data: CreateInboundInput): Promise<boolean> {
        logger.info('ℹ️ [InboundServices.createInbound] Creating inbound...');

        const createdBy = data.userId;
        if (!createdBy) {
            logger.error('❌ [InboundServices.createInbound] User ID is required');
            return false;
        }

        const result = await db.transaction(async (tx: DbTransaction) => {
            try {
                logger.info('ℹ️ [InboundServices.createInbound] Starting Inbound Flow...');

                if (!process.env.DEFAULT_SUPPLIER_ID) {
                    throw new Error('DEFAULT_SUPPLIER_ID is not set');
                }

                const updatedBy = createdBy;
                const receivedAt = data.receivedAt != null ? new Date(data.receivedAt) : null;
                const deliveryDate = receivedAt ?? new Date();
                let supplierDeliveryId: string | undefined = data.supplierDeliveryId ?? undefined;

                const organizationId = data.organizationId;

                // 2. If supplierDeliveryNo: create supplier delivery + supplier delivery items
                if (data.supplierDeliveryNo) {
                    const existingDo = await this.supplierDeliveriesRepository.getSupplierDeliveries(
                        { supplierDeliveryNo: data.supplierDeliveryNo },
                        { pageSize: 1, pageNumber: 1 }
                    );
                    if (existingDo && existingDo.query?.length > 0) {
                        throw new Error('Repeated supplier delivery number found');
                    }

                    const supplierDelivery = await this.supplierDeliveriesRepository.createSupplierDelivery({
                        organizationId: organizationId,
                        supplierId: process.env.DEFAULT_SUPPLIER_ID,
                        supplierDeliveryNo: data.supplierDeliveryNo,
                        deliveryDate,
                        status: 'RECEIVED_DRAFT',
                        createdBy,
                        updatedBy,
                    }, tx);
                    supplierDeliveryId = supplierDelivery.id;

                    if (data.items?.length) {
                        for (const item of data.items) {
                            const skuIdToUse = await this.resolveOrCreateSkuForItem(item, createdBy, updatedBy, tx);
                            if (!skuIdToUse) continue;
                            await this.supplierDeliveryItemsRepository.createSupplierDeliveryItem({
                                supplierDeliveryId: supplierDeliveryId!,
                                skuId: skuIdToUse,
                                qtyDelivered: item.qty,
                                lossQty: item.lossQty ?? '0',
                                createdBy,
                                updatedBy,
                            }, tx);
                        }
                    }
                }

                // generate grn no
                const grnNo = await this.grnsRepository.generateGrnNo(tx);

                // 3. Create GRN (same payload as createGrn)
                const grn = await this.grnsRepository.createGrn({
                    grnNo: grnNo,
                    organizationId: organizationId,
                    supplierId: process.env.DEFAULT_SUPPLIER_ID,
                    supplierDeliveryId,
                    poNo: data.poNo ?? undefined,
                    notes: data.notes ?? undefined,
                    proofUrl: data.proofUrl ?? undefined,
                    warehouseId: data.warehouseId ?? undefined,
                    createdBy,
                    updatedBy,
                    status: data.status ?? 'Draft',
                    receivedAt: receivedAt ?? undefined,
                }, tx);

                // 4. Create GRN items (same as createGrn)
                const grnItemRows: Array<{ grnId: string; skuId: string; qty: string; lossQty?: string; remarks?: string; rackId?: string | null; expiryDate?: Date | null; createdBy: string; updatedBy?: string }> = [];
                if (data.items?.length) {
                    for (const item of data.items) {
                        const skuIdToUse = await this.resolveOrCreateSkuForItem(item, createdBy, updatedBy, tx);
                        if (!skuIdToUse) continue;
                        const rackIds = item.rackIds && item.rackIds.length > 0
                            ? item.rackIds
                            : (item.rackId ? [item.rackId] : []);
                        grnItemRows.push({
                            grnId: grn.id,
                            skuId: skuIdToUse,
                            qty: item.qty,
                            lossQty: item.lossQty ?? '0',
                            remarks: item.remarks ?? undefined,
                            rackId: rackIds[0] ?? undefined,
                            expiryDate: item.expiryDate != null ? new Date(item.expiryDate) : null,
                            createdBy,
                            updatedBy,
                        });
                    }
                    if (grnItemRows.length > 0) {
                        const createdItems = await this.grnItemsRepository.createGrnItems(grnItemRows, tx);
                        if (createdItems === false) {
                            logger.error('[InboundServices] Failed to create GRN items batch');
                            throw new Error('Failed to create GRN items');
                        } else if (createdItems.length && data.items) {
                            const rackRows: { grnItemId: string; rackId: string }[] = [];
                            createdItems.forEach((createdItem, index) => {
                                const source = data.items![index];
                                const rackIds = (source.rackIds && source.rackIds.length > 0)
                                    ? source.rackIds
                                    : (source.rackId ? [source.rackId] : []);
                                for (const rackId of rackIds) {
                                    if (rackId) {
                                        rackRows.push({ grnItemId: createdItem.id, rackId });
                                    }
                                }
                            });
                            if (rackRows.length > 0) {
                                await tx.insert(GrnItemRacksTable).values(rackRows);
                            }
                        }
                    }
                }

                if (data.inboundQty != null && data.skuId) {
                    await this.skuRepository.updateSku(data.skuId, {
                        cartonQuantity: String(data.inboundQty),
                        updatedBy: createdBy,
                        updatedAt: new Date(),
                    }, organizationId, tx);
                }

                logger.info('✅ [InboundServices.createInbound] Inbound Flow completed successfully');
                return true;
            } catch (error) {
                logger.error('❌ [InboundServices.createInbound] Error:', error);
                throw error;
            }
        });

        if (!result) {
            logger.error('❌ [InboundServices.createInbound] Failed to create inbound');
        } else {
            logger.info('✅ [InboundServices.createInbound] Inbound created successfully');
        }
        return result;
    }

    /**
     * Resolve SKU by skuId or create from skuCode/skuDescription/skuUom (same logic as createGrn).
     */
    private async resolveOrCreateSkuForItem(
        item: CreateInboundItemInput,
        createdBy: string,
        updatedBy: string,
        tx: DbTransaction
    ): Promise<string | null> {
        let skuIdToUse: string | null = null;
        if (item.skuId) {
            const existingSku = await this.skuRepository.getSkuById(item.skuId, tx);
            if (existingSku) skuIdToUse = existingSku.skuId;
        }
        if (!skuIdToUse && item.skuCode && item.skuDescription && item.skuUom) {
            try {
                const newSku = await this.skuRepository.createSku({
                    skuCode: item.skuCode,
                    skuDescription: item.skuDescription,
                    cartonQuantity: '0',
                    lossQuantity: '0',
                    skuUom: item.skuUom,
                    isActive: true,
                    createdBy,
                    updatedBy,
                } as Parameters<typeof this.skuRepository.createSku>[0], tx);
                skuIdToUse = newSku.skuId;
            } catch (err) {
                logger.error('[InboundServices] Failed to create new SKU for GRN item', { skuCode: item.skuCode, err });
            }
        }
        if (!skuIdToUse) {
            logger.error('[InboundServices] SKU not found and cannot create', { item });
        }
        return skuIdToUse;
    }

    // TJ to confirm if this is needed
    async updateInbound(data: any): Promise<boolean> {
        // logger.info('ℹ️ [InboundServices.updateInbound] Updating inbound...');

        // const { userId, inboundQty } = data;
        // if (!userId) {
        //     logger.error('❌ [InboundServices.updateInbound] User ID is required');
        //     return false;
        // }

        return true;
    }
}
