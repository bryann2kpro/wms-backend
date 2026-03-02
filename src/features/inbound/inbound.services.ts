import { GrnItemsRepositoryClass } from "./grns-items.repository";
import { GrnsRepositoryClass } from "./grns.repository";
import { SupplierDeliveryItemsRepositoryClass } from "./supplier-deliveries/supplier-delivery-item.repository";
import { WarehousesRepositoryClass } from "@/features/master-data/warehouses.repository";
import { SupplierDeliveriesRepositoryClass } from "./supplier-deliveries/supplier-deliveries.repository";
import { logger } from "@/util/logger";
import { db } from "@/db";
import { SkuRepositoryClass } from "../master-data/sku.repository";

const DEFAULT_SUPPLIER_ID = 'b3e317c5-4bec-49aa-82f3-0a83115a8e70';

export class InboundServices {
    constructor(
        private readonly grnsRepository: GrnsRepositoryClass,
        private readonly skuRepository: SkuRepositoryClass,
        private readonly supplierDeliveriesRepository: SupplierDeliveriesRepositoryClass,
        private readonly supplierDeliveryItemsRepository: SupplierDeliveryItemsRepositoryClass,
        private readonly grnItemsRepository: GrnItemsRepositoryClass,
    ) {}

    async createInbound(data: any): Promise<boolean> {
        logger.info('ℹ️ [InboundServices.createInbound] Creating inbound...');

        const { userId, inboundQty } = data;
        if (!userId) {
            logger.error('❌ [InboundServices.createInbound] User ID is required');
            return false;
        }

        const result = await db.transaction(async (tx) => {
            try {
                logger.info('ℹ️ [InboundServices.createInbound] Starting Inbound Flow...');

                const createdBy = userId;
                const updatedBy = userId;
                const receivedAt = data.receivedAt != null ? new Date(data.receivedAt) : null;
                const deliveryDate = receivedAt ?? new Date();
                let supplierDeliveryId: string | undefined = data.supplierDeliveryId ?? undefined;

                const existingGrn = await this.grnsRepository.getGrns(
                    { grnNo: data.grnNo },
                    { pageSize: 1, pageNumber: 1 }
                );
                if (existingGrn && existingGrn.query?.length > 0) {
                    throw new Error('Repeated GRN code found');
                }

                if (data.supplierDeliveryNo) {
                    const existingDo = await this.supplierDeliveriesRepository.getSupplierDeliveries(
                        { supplierDeliveryNo: data.supplierDeliveryNo },
                        { pageSize: 1, pageNumber: 1 }
                    );
                    if (existingDo && existingDo.query?.length > 0) {
                        throw new Error('Repeated supplier delivery number found');
                    }
                    const supplierDelivery = await this.supplierDeliveriesRepository.createSupplierDelivery({
                        supplierId: DEFAULT_SUPPLIER_ID,
                        supplierDeliveryNo: data.supplierDeliveryNo,
                        deliveryDate,
                        status: 'RECEIVED_DRAFT',
                        createdBy,
                        updatedBy,
                    }, tx);
                    supplierDeliveryId = supplierDelivery.id;

                    if (data.items?.length) {
                        for (const item of data.items) {
                            let skuIdToUse: string | null = null;
                            if (item.skuId) {
                                const existingSku = await this.skuRepository.getSkuById(item.skuId);
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
                                continue;
                            }
                            await this.supplierDeliveryItemsRepository.createSupplierDeliveryItem({
                                supplierDeliveryId,
                                skuId: skuIdToUse,
                                qtyDelivered: item.qty,
                                lossQty: item.lossQty ?? '0',
                                createdBy,
                                updatedBy,
                            }, tx);
                        }
                    }
                }

                const grn = await this.grnsRepository.createGrn({
                    grnNo: data.grnNo,
                    supplierId: DEFAULT_SUPPLIER_ID,
                    supplierDeliveryId,
                    poNo: data.poNo ?? undefined,
                    warehouseId: data.warehouseId ?? undefined,
                    createdBy,
                    updatedBy,
                    status: data.status ?? 'Draft',
                    receivedAt,
                }, tx);

                if (data.items?.length) {
                    const grnItemRows: Array<{ grnId: string; skuId: string; qty: string; lossQty?: string; remarks?: string; rackId?: string | null; createdBy: string; updatedBy?: string }> = [];
                    for (const item of data.items) {
                        let skuIdToUse: string | null = null;
                        if (item.skuId) {
                            const existingSku = await this.skuRepository.getSkuById(item.skuId);
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
                            continue;
                        }
                        grnItemRows.push({
                            grnId: grn.id,
                            skuId: skuIdToUse,
                            qty: item.qty,
                            lossQty: item.lossQty ?? '0',
                            remarks: item.remarks ?? undefined,
                            rackId: item.rackId ?? undefined,
                            createdBy,
                            updatedBy,
                        });
                    }
                    if (grnItemRows.length > 0) {
                        const created = await this.grnItemsRepository.createGrnItems(grnItemRows, tx);
                        if (created === false) {
                            logger.error('[InboundServices] Failed to create GRN items batch');
                        }
                    }
                }

                if (inboundQty != null && data.skuId) {
                    logger.info('ℹ️ [InboundServices.createInbound] Updating inventory balance...');
                    await this.skuRepository.updateSku(data.skuId, {
                        cartonQuantity: String(inboundQty),
                        updatedBy: userId,
                        updatedAt: new Date(),
                    }, tx);
                    logger.info('✅ [InboundServices.createInbound] Inventory balance updated successfully');
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
