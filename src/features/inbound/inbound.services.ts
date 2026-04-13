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
import { EsAdvanceNoticeRepositoryClass } from "../es/es.repository";
import { SuppliersRepositoryClass } from "../master-data/suppliers.repository";
import { StockUnitRepositoryClass } from "../master-data/stock-unit.repository";

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
    lotNo?: string | null;
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
    /** ID of the advance notice this GRN was created from. Optional — omit for manual GRNs. */
    advanceNoticeId?: string | null;
};

export class InboundServices {
    constructor(
        private readonly grnsRepository: GrnsRepositoryClass,
        private readonly skuRepository: SkuRepositoryClass,
        private readonly supplierDeliveriesRepository: SupplierDeliveriesRepositoryClass,
        private readonly supplierDeliveryItemsRepository: SupplierDeliveryItemsRepositoryClass,
        private readonly grnItemsRepository: GrnItemsRepositoryClass,
        private readonly inventoryMovementRepository: InventoryMovementRepositoryClass,
        private readonly suppliersRepository: SuppliersRepositoryClass,
        private readonly stockUnitRepository: StockUnitRepositoryClass,
        private readonly esAdvanceNoticeRepository: EsAdvanceNoticeRepositoryClass,
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
                const resolvedSupplierId = await this.resolveSupplierId(data, tx);

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
                        supplierId: resolvedSupplierId,
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
                    supplierId: resolvedSupplierId,
                    supplierDeliveryId,
                    poNo: data.poNo ?? undefined,
                    notes: data.notes ?? undefined,
                    proofUrl: data.proofUrl ?? undefined,
                    warehouseId: data.warehouseId ?? undefined,
                    createdBy,
                    updatedBy,
                    status: data.status ?? 'Draft',
                    receivedAt: receivedAt ?? undefined,
                    advanceNoticeId: data.advanceNoticeId ?? undefined,
                }, tx);

                // 4. Create GRN items (same as createGrn)
                const grnItemRows: Array<{ grnId: string; skuId: string; qty: string; lossQty?: string; remarks?: string; rackId?: string | null; expiryDate?: Date | null; lotNo?: string | null; createdBy: string; updatedBy?: string }> = [];
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
                            lotNo: item.lotNo ?? null,
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

                // Mark the advance notice as linked so it no longer appears in the dropdown
                if (data.advanceNoticeId) {
                    await this.esAdvanceNoticeRepository.markLinked(data.advanceNoticeId, grn.id);
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

    private normalizeSupplierCode(code: string): string {
        return code.replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim().toUpperCase();
    }

    private parseSupplierEntity(entityRaw: string): { codeCandidates: string[]; nameCandidate: string } {
        const entity = entityRaw.trim();
        if (!entity) {
            return { codeCandidates: [], nameCandidate: '' };
        }

        const match = entity.match(/^([A-Za-z]{2,10})\s*-\s*([A-Za-z0-9]+)\s*(.*)$/);
        if (!match) {
            return { codeCandidates: [], nameCandidate: entity };
        }

        const prefix = match[1].toUpperCase();
        const identifier = match[2].toUpperCase();
        const rest = match[3]?.trim() ?? '';
        const compact = `${prefix}-${identifier}`;
        const spaced = `${prefix} -${identifier}`;

        return {
            codeCandidates: [...new Set([compact, spaced, this.normalizeSupplierCode(spaced)])],
            nameCandidate: rest || entity,
        };
    }

    private async resolveSupplierId(data: CreateInboundInput, tx: DbTransaction): Promise<string> {
        const organizationId = data.organizationId;
        const actor = data.userId;

        if (data.supplierId) {
            const existingSupplier = await this.suppliersRepository.getSupplierById(data.supplierId, organizationId);
            if (existingSupplier) {
                logger.info(`[InboundServices.resolveSupplierId] Matched supplier by input id: ${data.supplierId}`);
                return existingSupplier.supplierId;
            }
            logger.warn(`[InboundServices.resolveSupplierId] Input supplierId not found in organization: ${data.supplierId}`);
        }

        let asnEntity: string | null = null;
        if (data.advanceNoticeId) {
            const asn = await this.esAdvanceNoticeRepository.findById(data.advanceNoticeId);
            const payload = asn?.payload as { entity?: string } | undefined;
            if (payload?.entity?.trim()) {
                asnEntity = payload.entity.trim();
            }
        }

        if (asnEntity) {
            const { codeCandidates, nameCandidate } = this.parseSupplierEntity(asnEntity);

            for (const supplierCode of codeCandidates) {
                const byCode = await this.suppliersRepository.getSupplier(
                    { supplierCode },
                    { pageSize: 1, pageNumber: 1 },
                    organizationId,
                );
                if (byCode.query?.length) {
                    logger.info(`[InboundServices.resolveSupplierId] matched_by_code supplierCode=${supplierCode}`);
                    return byCode.query[0].supplierId;
                }
            }

            if (nameCandidate) {
                const byName = await this.suppliersRepository.getSupplier(
                    { supplierName: nameCandidate },
                    { pageSize: 5, pageNumber: 1 },
                    organizationId,
                );
                const exactName = byName.query?.find(
                    (s) => s.supplierName.trim().toUpperCase() === nameCandidate.trim().toUpperCase(),
                );
                if (exactName) {
                    logger.info(`[InboundServices.resolveSupplierId] matched_by_name supplierName=${exactName.supplierName}`);
                    return exactName.supplierId;
                }
            }

            const supplierCodeForCreate =
                codeCandidates[0] ||
                `AUTO-${Date.now()}`;
            const supplierNameForCreate = nameCandidate || asnEntity;
            const created = await this.suppliersRepository.createSupplier(
                {
                    organizationId,
                    supplierCode: this.normalizeSupplierCode(supplierCodeForCreate),
                    supplierName: supplierNameForCreate,
                    createdBy: actor,
                    updatedBy: actor,
                },
                tx,
            );
            logger.info(`[InboundServices.resolveSupplierId] created_from_asn_entity supplierId=${created.supplierId}`);
            return created.supplierId;
        }

        if (process.env.DEFAULT_SUPPLIER_ID) {
            logger.info(`[InboundServices.resolveSupplierId] fallback_env supplierId=${process.env.DEFAULT_SUPPLIER_ID}`);
            return process.env.DEFAULT_SUPPLIER_ID;
        }

        throw new Error('Unable to resolve supplierId. Provide supplierId or select an ASN with a valid entity.');
    }

    /**
     * Resolve SKU by skuId, then by skuCode lookup, then auto-create if enough data is present.
     * UOM text labels (e.g. "Ea", "Ctn") are resolved to stock_unit UUIDs automatically.
     */
    private async resolveOrCreateSkuForItem(
        item: CreateInboundItemInput,
        createdBy: string,
        updatedBy: string,
        tx: DbTransaction
    ): Promise<string | null> {
        // 1. Try by explicit skuId
        if (item.skuId) {
            const existingSku = await this.skuRepository.getSkuById(item.skuId, tx);
            if (existingSku) return existingSku.skuId;
        }

        // 2. Try by skuCode lookup (prevents duplicates when frontend couldn't resolve skuId)
        if (item.skuCode) {
            const byCode = await this.skuRepository.getSku({ skuCode: item.skuCode }, undefined, tx);
            if (byCode.query?.length) {
                logger.info(`[InboundServices.resolveOrCreateSkuForItem] matched_by_code skuCode=${item.skuCode}`);
                return byCode.query[0].skuId;
            }
        }

        // 3. Auto-create: need at minimum skuCode; fall back to skuCode as description when skuDescription is blank
        if (item.skuCode) {
            const descriptionToUse = item.skuDescription?.trim() || item.skuCode;
            const resolvedUom = await this.resolveSkuUom(item.skuUom ?? null);
            if (!resolvedUom) {
                logger.error('[InboundServices] Cannot create SKU — no valid UOM could be resolved', { skuCode: item.skuCode, skuUom: item.skuUom });
                return null;
            }
            try {
                const newSku = await this.skuRepository.createSku({
                    skuCode: item.skuCode,
                    skuDescription: descriptionToUse,
                    cartonQuantity: '0',
                    lossQuantity: '0',
                    skuUom: resolvedUom,
                    isActive: true,
                    createdBy,
                    updatedBy,
                } as Parameters<typeof this.skuRepository.createSku>[0], tx);
                logger.info(`[InboundServices.resolveOrCreateSkuForItem] created_sku skuId=${newSku.skuId} skuCode=${item.skuCode}`);
                return newSku.skuId;
            } catch (err) {
                logger.error('[InboundServices] Failed to create new SKU for GRN item', { skuCode: item.skuCode, err });
            }
        }

        logger.error('[InboundServices] SKU not found and cannot create', { item });
        return null;
    }

    private static readonly UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    /**
     * Resolve a skuUom value to a valid stock_unit UUID.
     * If it's already a UUID, return as-is. If it's a text label (e.g. "Ea"), look up by unitCode.
     * Falls back to the first active stock unit in the system.
     */
    private async resolveSkuUom(skuUom: string | null): Promise<string | null> {
        if (skuUom && InboundServices.UUID_RE.test(skuUom)) {
            return skuUom;
        }

        if (skuUom) {
            const byCode = await this.stockUnitRepository.getStockUnitByCode(skuUom.trim());
            if (byCode) {
                logger.info(`[InboundServices.resolveSkuUom] matched_by_code unitCode=${skuUom} -> ${byCode.stockUnitId}`);
                return byCode.stockUnitId;
            }
            const byCodeUpper = await this.stockUnitRepository.getStockUnitByCode(skuUom.trim().toUpperCase());
            if (byCodeUpper) {
                logger.info(`[InboundServices.resolveSkuUom] matched_by_code_upper unitCode=${skuUom} -> ${byCodeUpper.stockUnitId}`);
                return byCodeUpper.stockUnitId;
            }
        }

        const fallback = await this.stockUnitRepository.getStockUnit(
            { isActive: true },
            { pageSize: 1, pageNumber: 1 },
        );
        if (fallback.query?.length) {
            logger.info(`[InboundServices.resolveSkuUom] fallback_default unitId=${fallback.query[0].stockUnitId}`);
            return fallback.query[0].stockUnitId;
        }

        logger.error('[InboundServices.resolveSkuUom] No stock units found in system');
        return null;
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
