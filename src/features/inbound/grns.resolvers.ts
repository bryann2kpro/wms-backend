/**
 * GRN GraphQL Resolvers
 *  
 * @description Resolver functions for GRN (Goods Received Note) operations.
 * Uses GrnsRepository for data access (proper layer separation).
 * 
 * Type definitions are in grns.typeDefs.ts
 */

import { grnsRepository, grnItemsRepository, skuRepository, supplierDeliveriesRepository, supplierDeliveryItemsRepository } from '@/composition-root';
import { db } from '@/db';
import { withAudit } from '@/features/audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { GrnType } from './grns.model';
import { logger } from '@/util/logger';
import { GrnFilter } from './grns.repository';
import type { GrnItemsType } from './grns-items.repository';

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformGrn(grn: GrnType) {
    return {
        id: grn.id,
        grnNo: grn.grnNo,
        supplierId: grn.supplierId,
        supplierDeliveryId: grn.supplierDeliveryId,
        poNo: grn.poNo,
        status: grn.status,
        receivedAt: grn.receivedAt,
        approvedBy: grn.approvedBy,
        approvedAt: grn.approvedAt,
        createdAt: grn.createdAt,
        updatedAt: grn.updatedAt,
        createdBy: grn.createdBy,
        updatedBy: grn.updatedBy,
    }
}

function transformGrnItem(item: GrnItemsType, skuMap?: Map<string, { skuCode: string | null; skuDescription: string | null }>) {
    const sku = skuMap?.get(item.skuId);
    return {
        id: item.id,
        grnId: item.grnId,
        skuId: item.skuId,
        skuCode: sku?.skuCode ?? null,
        skuDescription: sku?.skuDescription ?? null,
        qty: item.qty,
        remarks: item.remarks,
        createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
        updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
        createdBy: item.createdBy,
        updatedBy: item.updatedBy,
    };
}

export const resolvers = {
    Query: {
        grns: async (_: unknown, args: {
            filter?: GrnFilter & { page?: number; pageSize?: number; pageNumber?: number };
            pageSize?: number;
            pageNumber?: number;
        }) => {
            try {
                const filter: GrnFilter = args.filter || {};
                if (args.filter) {
                    if (args.filter.id) {
                        filter.id = args.filter.id;
                    }
                    if (args.filter.grnNo) {
                        filter.grnNo = args.filter.grnNo;
                    }
                    if (args.filter.status) {
                        filter.status = args.filter.status;
                    }
                }
                const pageSize = args.pageSize ?? args.filter?.pageSize;
                const pageNumber = args.pageNumber ?? args.filter?.pageNumber ?? args.filter?.page;
                let paginationParams;
                if (pageSize != null && pageNumber != null) {
                    paginationParams = { pageSize, pageNumber };
                } else {
                    paginationParams = undefined;
                }
                const result = await grnsRepository.getGrns(filter, paginationParams);
                if (result === false) return false;
                return {
                    query: result.query.map(transformGrn),
                    pagination: result.pagination,
                };
            } catch (error) {
                logger.error('[grns.resolvers] Error:', error);
                return false;
            }
        },
    },
    Grn: {
        supplierDeliveryNo: async (parent: { supplierDeliveryId?: string | null }) => {
            if (!parent.supplierDeliveryId) return null;
            const result = await supplierDeliveriesRepository.getSupplierDeliveries(
                { id: parent.supplierDeliveryId },
                { pageSize: 1, pageNumber: 1 }
            );
            if (result === false || !result.query?.[0]) return null;
            return result.query[0].supplierDeliveryNo ?? null;
        },
        items: async (parent: { id: string }) => {
            const result = await grnItemsRepository.getGrnItems({ grnId: parent.id });
            if (result === false) return [];
            const skuIds = [...new Set(result.map((r) => r.skuId))];
            let skuMap = new Map<string, { skuCode: string | null; skuDescription: string | null }>();
            if (skuIds.length > 0) {
                const skuResult = await skuRepository.getSku({ skuId: skuIds });
                for (const s of skuResult.query) {
                    skuMap.set(s.skuId, { skuCode: s.skuCode ?? null, skuDescription: s.skuDescription ?? null });
                }
            }
            return result.map((item) => transformGrnItem(item, skuMap));
        },
    },
    Mutation: {
        createGrn: withAudit(
            {
                entity: 'GRN',
                action: 'CREATE',
                getEntityId: (result: GrnType | false | null): string | null =>
                    result && typeof result === 'object' && 'id' in result ? result.id : null,
            },
            async (_: unknown, { input }: {
                input: {
                    grnNo: string;
                    supplierId?: string | null;
                    supplierDeliveryId?: string | null;
                    supplierDeliveryNo?: string | null;
                    poNo?: string | null;
                    receivedAt?: string | null;
                    approvedBy?: string | null;
                    status?: string | null;
                    createdBy: string;
                    updatedBy?: string | null;
                    items?: Array<{ skuId?: string | null; qty: string; remarks?: string | null; skuCode?: string | null; skuDescription?: string | null; skuUom?: string | null }> | null;
                }
            }, context: GraphQLContext) => {
                try {
                    const createdBy = input.createdBy ?? context.user?.id;
                    if (!createdBy) {
                        throw new Error('createdBy is required (or provide an authenticated user)');
                    }
                    const receivedAt = input.receivedAt != null ? new Date(input.receivedAt) : null;
                    const deliveryDate = receivedAt ?? new Date();
                    const updatedBy = context.user?.id ?? undefined;
                    // for testing purpose,
                    const supplierId = 'b3e317c5-4bec-49aa-82f3-0a83115a8e70';

                    let supplierDeliveryId: string | undefined = input.supplierDeliveryId ?? undefined;

                    // When supplierDeliveryNo provided: create Supplier Delivery + Supplier Delivery Items first, then GRN
                    if (input.supplierDeliveryNo) { // TJ: SUPPLIER DELIVERY NO MUST BE PROVIDED
                        // 1. Create Supplier Delivery
                        const supplierDelivery = await supplierDeliveriesRepository.createSupplierDelivery({
                            supplierId,
                            supplierDeliveryNo: input.supplierDeliveryNo,
                            deliveryDate,
                            status: 'RECEIVED_DRAFT',
                            createdBy,
                            updatedBy: updatedBy ?? createdBy,
                        }, context.tx); // TJ: this context.tx is empty!
                        supplierDeliveryId = supplierDelivery.id;

                        if (!supplierDeliveryId) {
                            logger.error('[grns.resolvers]: Failed to create supplier delivery');
                            return false;
                        }

                        // 2. Resolve SKUs and create Supplier Delivery Items (qtyDelivered = item qty)
                        if (input.items?.length) {
                            for (const item of input.items) {
                                let skuIdToUse: string | null = null;
                                if (item.skuId) {
                                    const existingSku = await skuRepository.getSkuById(item.skuId);
                                    if (existingSku) skuIdToUse = existingSku.skuId;
                                }
                                if (!skuIdToUse && item.skuCode && item.skuDescription && item.skuUom) {
                                    try {
                                        const newSku = await skuRepository.createSku({
                                            skuCode: item.skuCode,
                                            skuDescription: item.skuDescription,
                                            skuQuantity: '0',
                                            skuUom: item.skuUom,
                                            isActive: true,
                                            createdBy,
                                            updatedBy: updatedBy ?? createdBy,
                                        } as Parameters<typeof skuRepository.createSku>[0], context.tx);
                                        skuIdToUse = newSku.skuId;
                                    } catch (err) {
                                        logger.error('[grns.resolvers]: Failed to create new SKU for GRN item', { skuCode: item.skuCode, err });
                                    }
                                }
                                if (!skuIdToUse) {
                                    logger.error('[grns.resolvers]: SKU not found and cannot create', { item });
                                    continue;
                                }
                                await supplierDeliveryItemsRepository.createSupplierDeliveryItem({
                                    supplierDeliveryId,
                                    skuId: skuIdToUse,
                                    qtyDelivered: item.qty,
                                    createdBy,
                                    updatedBy: updatedBy ?? createdBy,
                                }, context.tx);
                            }
                        }
                    }

                    // 3. Create GRN (with supplierDeliveryId when supplierDeliveryNo was provided)
                    const grn = await grnsRepository.createGrn({
                        grnNo: input.grnNo,
                        supplierId,
                        supplierDeliveryId,
                        poNo: input.poNo ?? undefined,
                        createdBy,
                        updatedBy,
                        status: input.status ?? 'Draft',
                        receivedAt,
                    }, context.tx);

                    // 4. Create GRN items
                    const grnItemRows: Array<{ grnId: string; skuId: string; qty: string; remarks?: string; createdBy: string; updatedBy?: string }> = [];
                    if (input.items?.length) {
                        for (const item of input.items) {
                            let skuIdToUse: string | null = null;
                            if (item.skuId) {
                                const existingSku = await skuRepository.getSkuById(item.skuId);
                                if (existingSku) skuIdToUse = existingSku.skuId;
                            }
                            if (!skuIdToUse && item.skuCode && item.skuDescription && item.skuUom) {
                                try {
                                    const newSku = await skuRepository.createSku({
                                        skuCode: item.skuCode,
                                        skuDescription: item.skuDescription,
                                        skuQuantity: '0',
                                        skuUom: item.skuUom,
                                        isActive: true,
                                        createdBy,
                                        updatedBy: updatedBy ?? createdBy,
                                    } as Parameters<typeof skuRepository.createSku>[0], context.tx);
                                    skuIdToUse = newSku.skuId;
                                } catch (err) {
                                    logger.error('[grns.resolvers]: Failed to create new SKU for GRN item', { skuCode: item.skuCode, err });
                                }
                            }
                            if (!skuIdToUse) {
                                logger.error('[grns.resolvers]: SKU not found and cannot create', { item });
                                continue;
                            }
                            grnItemRows.push({
                                grnId: grn.id,
                                skuId: skuIdToUse,
                                qty: item.qty,
                                remarks: item.remarks ?? undefined,
                                createdBy,
                                updatedBy,
                            });
                        }
                        const created = await grnItemsRepository.createGrnItems(grnItemRows, context.tx);
                        if (created === false) {
                            logger.error('[grns.resolvers]: Failed to create GRN items batch');
                        }
                    }

                    return transformGrn(grn);
                } catch (error) {
                    logger.error('[grns.resolvers] createGrn Error:', error);
                    throw error;
                }
            }
        ),

        updateGrn: withAudit(
            {
                entity: 'GRN',
                action: 'UPDATE',
                getEntityId: (_, args) => args.id,
                getOldData: async (args) => {
                    return await grnsRepository.getGrns({ id: args.id });
                },
            },
            async (_: unknown, { id, input }: {
                id: string; input: {
                    grnNo?: string | null;
                    supplierId?: string | null;
                    supplierDeliveryId?: string | null;
                    supplierDeliveryNo?: string | null;
                    poNo?: string | null;
                    receivedAt?: string | null;
                    approvedBy?: string | null;
                    approvedAt?: string | null;
                    status?: string | null;
                    updatedBy?: string | null;
                    updatedAt?: Date;
                    items?: Array<{ skuId?: string | null; qty: string; remarks?: string | null; skuCode?: string | null; skuDescription?: string | null; skuUom?: string | null }> | null;
                }
            }, context: GraphQLContext) => {
                try {
                    const updatedBy = input.updatedBy ?? context.user?.id;
                    if (!updatedBy) {
                        logger.error('[grns.resolvers]: Data updated failed caused by user not found.');
                        return false;
                    }

                    const grnResult = await grnsRepository.getGrns({ id });
                    const existingGrn = (grnResult && 'query' in grnResult && grnResult.query?.[0]) ? grnResult.query[0] : null;
                    if (!existingGrn) {
                        logger.error('[grns.resolvers]: GRN not found', { id });
                        return false;
                    }

                    const updateData: Record<string, unknown> = { updatedBy };
                    if (input.grnNo !== undefined) updateData.grnNo = input.grnNo;
                    if (input.supplierId !== undefined) updateData.supplierId = input.supplierId;
                    if (input.supplierDeliveryId !== undefined) updateData.supplierDeliveryId = input.supplierDeliveryId;
                    if (input.poNo !== undefined) updateData.poNo = input.poNo;
                    if (input.receivedAt !== undefined) updateData.receivedAt = input.receivedAt != null ? new Date(input.receivedAt) : null;
                    if (input.approvedBy !== undefined) updateData.approvedBy = input.approvedBy;
                    if (input.approvedAt !== undefined) updateData.approvedAt = input.approvedAt != null ? new Date(input.approvedAt) : null;
                    if (input.status !== undefined) updateData.status = input.status;

                    const deliveryDate = input.receivedAt != null ? new Date(input.receivedAt) : undefined;
                    let supplierDeliveryId: string | null = existingGrn.supplierDeliveryId ?? null;

                    // Create or update Supplier Delivery (supplierDeliveryNo and deliveryDate from receivedAt)
                    if (input.supplierDeliveryNo != null) {
                        if (supplierDeliveryId) {
                            const deliveryUpdate: Record<string, unknown> = { updatedBy, updatedAt: new Date() };
                            deliveryUpdate.supplierDeliveryNo = input.supplierDeliveryNo;
                            if (deliveryDate != null) deliveryUpdate.deliveryDate = deliveryDate;
                            await supplierDeliveriesRepository.updateSupplierDelivery(supplierDeliveryId, deliveryUpdate, context.tx);
                        } else {
                            const supplierId = (input.supplierId ?? existingGrn.supplierId) as string;
                            const created = await supplierDeliveriesRepository.createSupplierDelivery({
                                supplierId,
                                supplierDeliveryNo: input.supplierDeliveryNo,
                                deliveryDate: deliveryDate ?? new Date(),
                                status: 'RECEIVED_DRAFT',
                                createdBy: updatedBy,
                                updatedBy,
                            }, context.tx);
                            supplierDeliveryId = created.id;
                            updateData.supplierDeliveryId = created.id;
                        }
                    } else if (supplierDeliveryId && deliveryDate != null) {
                        await supplierDeliveriesRepository.updateSupplierDelivery(supplierDeliveryId, {
                            deliveryDate,
                            updatedBy,
                            updatedAt: new Date(),
                        }, context.tx);
                    }

                    // Replace GRN items and sync Supplier Delivery Items (skuId, qtyDelivered = item qty)
                    if (input.items != null && input.items.length > 0) {
                        const createdBy = existingGrn.createdBy;
                        const grnItemRows: Array<{ grnId: string; skuId: string; qty: string; remarks?: string; createdBy: string; updatedBy?: string }> = [];

                        for (const item of input.items) {
                            let skuIdToUse: string | null = null;
                            if (item.skuId) {
                                const existingSku = await skuRepository.getSkuById(item.skuId);
                                if (existingSku) skuIdToUse = existingSku.skuId;
                            }
                            if (!skuIdToUse && item.skuCode && item.skuDescription && item.skuUom) {
                                try {
                                    const newSku = await skuRepository.createSku({
                                        skuCode: item.skuCode,
                                        skuDescription: item.skuDescription,
                                        skuQuantity: '0',
                                        skuUom: item.skuUom,
                                        isActive: true,
                                        createdBy,
                                        updatedBy: updatedBy ?? createdBy,
                                    } as Parameters<typeof skuRepository.createSku>[0], context.tx);
                                    skuIdToUse = newSku.skuId;
                                } catch (err) {
                                    logger.error('[grns.resolvers]: Failed to create new SKU for GRN item', { skuCode: item.skuCode, err });
                                }
                            }
                            if (!skuIdToUse) {
                                logger.error('[grns.resolvers]: SKU not found and cannot create', { item });
                                continue;
                            }
                            grnItemRows.push({
                                grnId: id,
                                skuId: skuIdToUse,
                                qty: item.qty,
                                remarks: item.remarks ?? undefined,
                                createdBy,
                                updatedBy,
                            });
                        }

                        await grnItemsRepository.deleteGrnItem({ grnId: id }, context.tx);
                        if (grnItemRows.length > 0) {
                            await grnItemsRepository.createGrnItems(grnItemRows, context.tx);
                        }

                        const effectiveDeliveryId = supplierDeliveryId ?? (updateData.supplierDeliveryId as string | undefined);
                        if (effectiveDeliveryId) {
                            await supplierDeliveryItemsRepository.deleteSupplierDeliveryItemsByDeliveryId(effectiveDeliveryId, context.tx);
                            for (const item of grnItemRows) {
                                await supplierDeliveryItemsRepository.createSupplierDeliveryItem({
                                    supplierDeliveryId: effectiveDeliveryId,
                                    skuId: item.skuId,
                                    qtyDelivered: item.qty,
                                    createdBy: item.createdBy,
                                    updatedBy: item.updatedBy ?? updatedBy,
                                }, context.tx);
                            }
                        }
                    }

                    const grn = await grnsRepository.updateGrn(id, updateData, context.tx);
                    if (!grn) return false;

                    if (updateData.status === 'Approved') {
                        const grnItems = await grnItemsRepository.getGrnItems({ grnId: id }, context.tx);
                        if (grnItems === false) {
                            logger.error('[grns.resolvers]: Failed to get GRN items');
                            throw new Error('Failed to get GRN items for approval');
                        }
                        const qtyBySkuId = new Map<string, number>();
                        for (const item of grnItems) {
                            const add = Number(item.qty ?? 0);
                            qtyBySkuId.set(item.skuId, (qtyBySkuId.get(item.skuId) ?? 0) + add);
                        }
                        const skuIds = [...qtyBySkuId.keys()];
                        if (skuIds.length > 0) {
                            const { query: skus } = await skuRepository.getSku({ skuId: skuIds }, undefined, context.tx);
                            const skuMap = new Map(skus.map((s) => [s.skuId, s]));
                            const updates = skuIds.map(async (skuId) => {
                                const sku = skuMap.get(skuId);
                                if (!sku) throw new Error(`SKU not found: ${skuId}`);
                                const currentQty = Number(sku.skuQuantity ?? 0);
                                const addQty = qtyBySkuId.get(skuId) ?? 0;
                                const newQty = (currentQty + addQty).toFixed(2);
                                const updated = await skuRepository.updateSku(skuId, { skuQuantity: newQty }, context.tx);
                                if (!updated) throw new Error(`Failed to update SKU quantity: ${skuId}`);
                                return updated;
                            });
                            await Promise.all(updates);
                        }
                    }

                    return transformGrn(grn);
                } catch (error) {
                    logger.error('[grns.resolvers] Error:', error);
                    return false;
                }
            }
        ),

        deleteGrn: withAudit(
            {
                entity: 'GRN',
                action: 'DELETE',
                getEntityId: (_, args) => args.id,
                getOldData: async (args) => grnsRepository.getGrns({ id: args.id }),
            },
            async (_: unknown, { id }: { id: string }) => {
                try {
                    await db.transaction(async (tx) => {
                        const grnResult = await grnsRepository.getGrns({ id });
                        const grn = grnResult && 'query' in grnResult && grnResult.query?.[0] ? grnResult.query[0] : null;
                        const supplierDeliveryId = grn?.supplierDeliveryId ?? null;
                        if (supplierDeliveryId) {
                            const deleteDOItems = await supplierDeliveryItemsRepository.deleteSupplierDeliveryItemsByDeliveryId(supplierDeliveryId, tx);
                            if (deleteDOItems === false) {
                                logger.error('[grns.resolvers]: Failed to delete DO items');
                                return false;
                            }
                            const deletedDelivery = await supplierDeliveriesRepository.deleteSupplierDelivery(supplierDeliveryId, tx);
                            if (deletedDelivery === false) {
                                logger.error('[grns.resolvers]: Failed to delete supplier delivery');
                                return false;
                            }
                        }
                        const deleteGrnItems = await grnItemsRepository.deleteGrnItem({ grnId: id }, tx);
                        if (deleteGrnItems === false) {
                            logger.error('[grns.resolvers]: Failed to delete GRN items');
                            return false;
                        }
                        const deleted = await grnsRepository.deleteGrn(id, tx);
                        if (!deleted) {
                            logger.error('[grns.resolvers]: Failed to delete GRN');
                            return false;
                        }
                    });
                    return true;
                } catch (error) {
                    logger.error('[grns.resolvers] Error:', error);
                    return false;
                }
            }
        ),
    },
};
