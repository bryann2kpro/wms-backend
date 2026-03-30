/**
 * GRN GraphQL Resolvers
 *  
 * @description Resolver functions for GRN (Goods Received Note) operations.
 * Uses GrnsRepository for data access (proper layer separation).
 * 
 * Type definitions are in grns.typeDefs.ts
 */

import { grnsRepository, grnItemsRepository, skuRepository, supplierDeliveriesRepository, supplierDeliveryItemsRepository, authRepository, warehousesRepository, racksRepository, inboundServices, inventoryMovementRepository, esItemReceiptService, esAdvanceNoticeRepository } from '@/composition-root';
import { db } from '@/db';
import { withAudit } from '@/features/audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { GraphQLError } from 'graphql';
import { GrnType, GrnItemRacksTable } from './grns.model';
import { logger } from '@/util/logger';
import { GrnFilter } from './grns.repository';
import type { GrnItemsType } from './grns-items.repository';
import { inArray } from 'drizzle-orm';
import { InventoryMovementType } from '../inventory/inventory-movement/inventory.model';

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformGrn(grn: GrnType) {
    return {
        id: grn.id,
        organizationId: grn.organizationId,
        grnNo: grn.grnNo,
        supplierId: grn.supplierId,
        supplierDeliveryId: grn.supplierDeliveryId,
        poNo: grn.poNo,
        status: grn.status,
        receivedAt: grn.receivedAt,
        approvedBy: grn.approvedBy,
        approvedAt: grn.approvedAt,
        notes: grn.notes ?? null,
        proofUrl: grn.proofUrl ?? null,
        warehouseId: grn.warehouseId ?? null,
        nsError: grn.nsError ? JSON.stringify(grn.nsError) : null,
        nsSentAt: grn.nsSentAt ? (grn.nsSentAt instanceof Date ? grn.nsSentAt.toISOString() : grn.nsSentAt) : null,
        createdAt: grn.createdAt,
        updatedAt: grn.updatedAt,
        createdBy: grn.createdBy,
        updatedBy: grn.updatedBy,
    }
}

function transformGrnItem(
    item: GrnItemsType,
    skuMap?: Map<string, { skuCode: string | null; skuDescription: string | null }>,
    rackMap?: Map<string, string[]>
) {
    const sku = skuMap?.get(item.skuId);
    const rackIds = rackMap?.get(item.id) ?? (item.rackId ? [item.rackId] : []);
    const primaryRackId = rackIds[0] ?? null;
    return {
        id: item.id,
        grnId: item.grnId,
        skuId: item.skuId,
        skuCode: sku?.skuCode ?? null,
        skuDescription: sku?.skuDescription ?? null,
        qty: item.qty,
        lossQty: item.lossQty ?? '0',
        remarks: item.remarks,
        rackId: primaryRackId,
        rackIds,
        expiryDate: (item as any).expiryDate?.toISOString?.() ?? (item as any).expiryDate ?? null,
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
        }, context: GraphQLContext) => {
            try {
                const organizationId = context.organizationId;
                const filter: GrnFilter = args.filter || {};
                if (args.filter) {
                    if (args.filter.id) {
                        filter.id = args.filter.id
                    };
                    if (args.filter.grnNo) {
                        filter.grnNo = args.filter.grnNo;
                    };
                    if (args.filter.search != null) {
                        filter.search = args.filter.search;
                    };
                    if (args.filter.status) {
                        filter.status = args.filter.status;
                    };
                    if (args.filter.excludeDraft === true) {
                        filter.excludeDraft = true;
                    }
                    if (args.filter.sortBy != null) {
                        filter.sortBy = args.filter.sortBy;
                    };
                    if (args.filter.sortOrder != null) {
                        filter.sortOrder = args.filter.sortOrder;
                    };
                }
                const pageSize = args.pageSize ?? args.filter?.pageSize;
                const pageNumber = args.pageNumber ?? args.filter?.pageNumber ?? args.filter?.page;
                let paginationParams;
                if (pageSize != null && pageNumber != null) {
                    paginationParams = { pageSize, pageNumber };
                } else {
                    paginationParams = undefined;
                }
                const result = await grnsRepository.getGrns(filter, paginationParams, organizationId ?? undefined);
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
        nextGrnNumber: async (_: unknown, args: { date?: string | null }, context: GraphQLContext) => {
            try {
                const baseDate = args.date ? new Date(args.date) : new Date();
                if (Number.isNaN(baseDate.getTime())) {
                    throw new GraphQLError('Invalid date format for nextGrnNumber', {
                        extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
                    });
                }
                return await grnsRepository.getNextGrnNoForDate(baseDate, context.organizationId ?? undefined);
            } catch (error) {
                logger.error('[grns.resolvers] nextGrnNumber Error:', error);
                throw error;
            }
        },
        listPendingAdvanceNotices: async () => {
            try {
                const records = await esAdvanceNoticeRepository.findPending();
                return records.map((r) => {
                    const p = r.payload as {
                        tranid: string;
                        entity: string;
                        duedate: string;
                        lines?: Array<{
                            lineuniquekey: number;
                            itemid: string;
                            displayname?: string;
                            quantity: number;
                            units: string;
                            custrecord_r2o_order_code?: string;
                        }>;
                    };
                    return {
                        id: r.id,
                        tranid: p.tranid ?? r.tranid,
                        entity: p.entity ?? '',
                        duedate: p.duedate ?? '',
                        receivedAt: r.receivedAt instanceof Date ? r.receivedAt.toISOString() : r.receivedAt,
                        lines: (p.lines ?? []).map((l) => ({
                            lineuniquekey: l.lineuniquekey,
                            itemid: l.itemid,
                            displayname: l.displayname ?? null,
                            quantity: l.quantity,
                            units: l.units,
                            custrecord_r2o_order_code: l.custrecord_r2o_order_code ?? null,
                        })),
                    };
                });
            } catch (error) {
                logger.error('[grns.resolvers] listPendingAdvanceNotices Error:', error);
                throw error;
            }
        },
    },
    Grn: {
        createdByUser: async (parent: { createdBy?: string | null }) => {
            if (!parent.createdBy) return null;
            const user = await authRepository.getUserById(parent.createdBy);
            return user ? { id: user.id, displayName: user.displayName } : null;
        },
        updatedByUser: async (parent: { updatedBy?: string | null }) => {
            if (!parent.updatedBy) return null;
            const user = await authRepository.getUserById(parent.updatedBy);
            return user ? { id: user.id, displayName: user.displayName } : null;
        },
        supplierDeliveryNo: async (parent: { supplierDeliveryId?: string | null }) => {
            if (!parent.supplierDeliveryId) return null;
            const result = await supplierDeliveriesRepository.getSupplierDeliveries(
                { id: parent.supplierDeliveryId },
                { pageSize: 1, pageNumber: 1 }
            );
            if (result === false || !result.query?.[0]) return null;
            return result.query[0].supplierDeliveryNo ?? null;
        },
        warehouse: async (parent: { warehouseId?: string | null }) => {
            if (!parent.warehouseId) return null;
            const warehouse = await warehousesRepository.getWarehouseById(parent.warehouseId);
            if (!warehouse) return null;
            return {
                warehouseId: warehouse.warehouseId,
                warehouseName: warehouse.warehouseName,
                warehouseCode: warehouse.warehouseCode ?? null,
                warehouseAddress: warehouse.warehouseAddress ?? null,
                createdAt: warehouse.createdAt?.toISOString?.() ?? warehouse.createdAt,
                updatedAt: warehouse.updatedAt?.toISOString?.() ?? warehouse.updatedAt,
                createdBy: warehouse.createdBy,
                updatedBy: warehouse.updatedBy,
            };
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

            const grnItemIds = result.map((r) => r.id);
            let rackMap = new Map<string, string[]>();
            if (grnItemIds.length > 0) {
                const rackLinks = await db
                    .select()
                    .from(GrnItemRacksTable)
                    .where(inArray(GrnItemRacksTable.grnItemId, grnItemIds));
                for (const link of rackLinks) {
                    const current = rackMap.get(link.grnItemId) ?? [];
                    current.push(link.rackId);
                    rackMap.set(link.grnItemId, current);
                }
            }

            return result.map((item) => transformGrnItem(item, skuMap, rackMap));
        },
    },
    GrnItem: {
        rack: async (parent: { rackId?: string | null }) => {
            if (!parent.rackId) return null;
            const rack = await racksRepository.getRackById(parent.rackId);
            if (!rack) return null;
            return {
                rackId: rack.rackId,
                rackRow: rack.rackRow,
                rackColumn: rack.rackColumn,
                rackLevel: rack.rackLevel,
                createdAt: rack.createdAt?.toISOString?.() ?? rack.createdAt,
                updatedAt: rack.updatedAt?.toISOString?.() ?? rack.updatedAt,
                createdBy: rack.createdBy,
                updatedBy: rack.updatedBy,
            };
        },
    },
    Mutation: {
        createInbound: async (_: unknown, { input }: { input: {
            userId: string;
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
            items?: Array<{ skuId?: string | null; qty: string; lossQty?: string | null; remarks?: string | null; rackId?: string | null; skuCode?: string | null; skuDescription?: string | null; skuUom?: string | null }> | null;
            inboundQty?: number | null;
            skuId?: string | null;
            advanceNoticeId?: string | null;
        } }, context: GraphQLContext) => {
            try {
                const result = await inboundServices.createInbound({
                    userId: input.userId,
                    organizationId: context.organizationId!,
                    grnNo: input.grnNo,
                    supplierId: input.supplierId,
                    supplierDeliveryId: input.supplierDeliveryId,
                    supplierDeliveryNo: input.supplierDeliveryNo,
                    poNo: input.poNo,
                    receivedAt: input.receivedAt,
                    notes: input.notes,
                    proofUrl: input.proofUrl,
                    warehouseId: input.warehouseId,
                    status: input.status,
                    items: input.items ?? undefined,
                    inboundQty: input.inboundQty ?? undefined,
                    skuId: input.skuId ?? undefined,
                    advanceNoticeId: input.advanceNoticeId ?? undefined,
                });
                return result;
            } catch (error) {
                logger.error('[grns.resolvers.createInbound] Error:', error);
                throw error;
            }
        },
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
                    notes?: string | null;
                    proofUrl?: string | null;
                    warehouseId?: string | null;
                    approvedBy?: string | null;
                    status?: string | null;
                    createdBy: string;
                    updatedBy?: string | null;  
                    items?: Array<{ skuId?: string | null; qty: string; lossQty?: string | null; remarks?: string | null; rackId?: string | null; rackIds?: string[] | null; expiryDate?: string | null; skuCode?: string | null; skuDescription?: string | null; skuUom?: string | null }> | null;
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

                    // Check for duplicate GRN code before creating
                    const existingResult = await grnsRepository.getGrns(
                        { grnNo: input.grnNo },
                        { pageSize: 1, pageNumber: 1 },
                        context.organizationId ?? undefined
                    );
                    if (existingResult && existingResult.query?.length > 0) {
                        throw new GraphQLError('Repeated GRN code found', {
                            extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
                        });
                    }

                    if (input.supplierDeliveryNo) {
                        const existingDo = await supplierDeliveriesRepository.getSupplierDeliveries(
                            { supplierDeliveryNo: input.supplierDeliveryNo },
                            { pageSize: 1, pageNumber: 1 }
                        );
                        if (existingDo && existingDo.query?.length > 0) {
                            throw new GraphQLError('Repeated supplier delivery number found', {
                                extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
                            });
                        }
                        const supplierDelivery = await supplierDeliveriesRepository.createSupplierDelivery({
                            organizationId: context.organizationId ?? '',
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
                                            cartonQuantity: '0',
                                            lossQuantity: '0',
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
                                    lossQty: item.lossQty ?? '0',
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
                        notes: input.notes ?? undefined,
                        proofUrl: input.proofUrl ?? undefined,
                        warehouseId: input.warehouseId ?? undefined,
                        createdBy,
                        updatedBy,
                        status: input.status ?? 'Draft',
                        receivedAt,
                        organizationId: context.organizationId ?? '',
                    }, context.tx);

                    // 4. Create GRN items
                    const grnItemRows: Array<{ grnId: string; skuId: string; qty: string; lossQty?: string; remarks?: string; rackId?: string | null; expiryDate?: Date | null; createdBy: string; updatedBy?: string }> = [];
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
                                        cartonQuantity: '0',
                                        lossQuantity: '0',
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
                        const createdItems = await grnItemsRepository.createGrnItems(grnItemRows, context.tx);
                        if (createdItems === false) {
                            logger.error('[grns.resolvers]: Failed to create GRN items batch');
                        } else if (createdItems.length && input.items) {
                            const rackRows: { grnItemId: string; rackId: string }[] = [];
                            createdItems.forEach((createdItem, index) => {
                                const source = input.items![index];
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
                                await db.insert(GrnItemRacksTable).values(rackRows);
                            }
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
                getOldData: async (args, context) => {
                    const result = await grnsRepository.getGrns(
                        { id: args.id },
                        undefined,
                        context.organizationId ?? undefined,
                    );
                    const previous = result && 'query' in result ? result.query?.[0] : null;
                    return previous ? transformGrn(previous) : null;
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
                    notes?: string | null;
                    proofUrl?: string | null;
                    warehouseId?: string | null;
                    approvedBy?: string | null;
                    approvedAt?: string | null;
                    status?: string | null;
                    updatedBy?: string | null;
                    updatedAt?: Date;
                    items?: Array<{ skuId?: string | null; qty: string; lossQty?: string | null; remarks?: string | null; rackId?: string | null; rackIds?: string[] | null; expiryDate?: string | null; skuCode?: string | null; skuDescription?: string | null; skuUom?: string | null }> | null;
                }
            }, context: GraphQLContext) => {
                try {
                    const updatedBy = input.updatedBy ?? context.user?.id;
                    if (!updatedBy) {
                        logger.error('[grns.resolvers]: Data updated failed caused by user not found.');
                        return false;
                    }

                    const grnResult = await grnsRepository.getGrns({ id }, undefined, context.organizationId ?? undefined);
                    const existingGrn = (grnResult && 'query' in grnResult && grnResult.query?.[0]) ? grnResult.query[0] : null;
                    if (!existingGrn) {
                        logger.error('[grns.resolvers]: GRN not found', { id });
                        return false;
                    }

                    if (input.grnNo != null && input.grnNo !== existingGrn.grnNo) {
                        const existingResult = await grnsRepository.getGrns(
                            { grnNo: input.grnNo },
                            { pageSize: 1, pageNumber: 1 },
                            context.organizationId ?? undefined
                        );
                        const existingByGrnNo = existingResult && existingResult.query?.[0];
                        if (existingByGrnNo && existingByGrnNo.id !== id) {
                            throw new GraphQLError('Repeated GRN code found', {
                                extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
                            });
                        }
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
                    if (input.notes !== undefined) updateData.notes = input.notes;
                    if (input.proofUrl !== undefined) updateData.proofUrl = input.proofUrl;
                    if (input.warehouseId !== undefined) updateData.warehouseId = input.warehouseId;

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
                                organizationId: context.organizationId ?? '',
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
                        const grnItemRows: Array<{ grnId: string; skuId: string; qty: string; lossQty?: string; remarks?: string; rackId?: string | null; expiryDate?: Date | null; createdBy: string; updatedBy?: string }> = [];

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
                                        cartonQuantity: '0',
                                        lossQuantity: '0',
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
                            const rackIds = item.rackIds && item.rackIds.length > 0
                                ? item.rackIds
                                : (item.rackId ? [item.rackId] : []);
                            grnItemRows.push({
                                grnId: id,
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

                        // Delete existing rack mappings for this GRN's items
                        const existingItems = await grnItemsRepository.getGrnItems({ grnId: id }, context.tx);
                        if (existingItems && existingItems.length > 0) {
                            const existingIds = existingItems.map((i) => i.id);
                            await db
                                .delete(GrnItemRacksTable)
                                .where(inArray(GrnItemRacksTable.grnItemId, existingIds));
                        }

                        await grnItemsRepository.deleteGrnItem({ grnId: id }, context.tx);
                        if (grnItemRows.length > 0) {
                            const createdItems = await grnItemsRepository.createGrnItems(grnItemRows, context.tx);
                            if (createdItems !== false && input.items) {
                                const rackRows: { grnItemId: string; rackId: string }[] = [];
                                createdItems.forEach((createdItem, index) => {
                                    const source = input.items![index];
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
                                    await db.insert(GrnItemRacksTable).values(rackRows);
                                }
                            }
                        }

                        const effectiveDeliveryId = supplierDeliveryId ?? (updateData.supplierDeliveryId as string | undefined);
                        if (effectiveDeliveryId) {
                            await supplierDeliveryItemsRepository.deleteSupplierDeliveryItemsByDeliveryId(effectiveDeliveryId, context.tx);
                            for (const item of grnItemRows) {
                                await supplierDeliveryItemsRepository.createSupplierDeliveryItem({
                                    supplierDeliveryId: effectiveDeliveryId,
                                    skuId: item.skuId,
                                    qtyDelivered: item.qty,
                                    lossQty: item.lossQty ?? '0',
                                    createdBy: item.createdBy,
                                    updatedBy: item.updatedBy ?? updatedBy,
                                }, context.tx);
                            }
                        }
                    }

                    const grn = await grnsRepository.updateGrn(id, updateData, context.tx);
                    if (!grn) return false;

                    // When status is set to Approved: add GRN item qty (net) and lossQty to SKU inventory
                    if (updateData.status === 'Approved') {
                        const grnItems = await grnItemsRepository.getGrnItems({ grnId: id }, context.tx);
                        if (grnItems === false) {
                            logger.error('[grns.resolvers]: Failed to get GRN items');
                            throw new Error('Failed to get GRN items for approval');
                        }
                    //     // Aggregate per SKU: net received (qty - lossQty) → cartonQuantity, lossQty → lossQuantity
                    //     const addQtyBySkuId = new Map<string, number>();
                    //     const addLossBySkuId = new Map<string, number>();
                    //     for (const item of grnItems) {
                    //         const qty = Number(item.qty ?? 0);
                    //         const lossQty = Number((item as { lossQty?: string }).lossQty ?? 0);
                    //         const netQty = qty - lossQty;
                    //         addQtyBySkuId.set(item.skuId, (addQtyBySkuId.get(item.skuId) ?? 0) + netQty);
                    //         addLossBySkuId.set(item.skuId, (addLossBySkuId.get(item.skuId) ?? 0) + lossQty);
                    //     }
                    //     const skuIds = [...new Set([...addQtyBySkuId.keys(), ...addLossBySkuId.keys()])];
                    //     if (skuIds.length > 0) {
                    //         const { query: skus } = await skuRepository.getSku({ skuId: skuIds }, undefined, context.tx);
                    //         const skuMap = new Map(skus.map((s) => [s.skuId, s]));
                    //         const updates = skuIds.map(async (skuId) => {
                    //             const sku = skuMap.get(skuId);
                    //             if (!sku) throw new Error(`SKU not found: ${skuId}`);
                    //             const currentQty = Number(sku.cartonQuantity ?? 0);
                    //             const currentLoss = Number(sku.lossQuantity ?? 0);
                    //             const addQty = addQtyBySkuId.get(skuId) ?? 0;
                    //             const addLoss = addLossBySkuId.get(skuId) ?? 0;
                    //             const newQty = (currentQty + addQty).toFixed(2);
                    //             const newLoss = (currentLoss + addLoss).toFixed(2);
                    //             const updated = await skuRepository.updateSku(skuId, { cartonQuantity: newQty, lossQuantity: newLoss }, context.tx);
                    //             if (!updated) throw new Error(`Failed to update SKU quantity: ${skuId}`);
                    //             return updated;
                    //         });
                    //         await Promise.all(updates);
                    //     }

                        await inventoryMovementRepository.createInventoryMovement(grnItems.map(item => ({
                            skuId: item.skuId,
                            quantity: item.qty,
                            referenceNo: grn.grnNo,
                            reason: 'Inbound',
                            createdBy: updatedBy,
                            updatedBy: updatedBy,
                            movementType: InventoryMovementType.INBOUND,
                        })), updatedBy, context.organizationId!, context.tx);

                        return transformGrn(grn);
                    }

                    if (updateData.status === 'SentToES') {
                        logger.info(`ℹ️ [grns.resolvers] Sending Item Receipt to NetSuite — grnNo: ${existingGrn.grnNo}`);
                        const nsResult = await esItemReceiptService.sendItemReceipt(existingGrn, context.organizationId!);
                        const finalStatus = nsResult.success ? 'SentToES' : 'Failed';
                        const updatedGrn = await grnsRepository.updateGrn(id, {
                            status: finalStatus,
                            nsError: nsResult.success ? null : nsResult.nsResponse,
                            nsSentAt: new Date(),
                        }, context.tx);
                        logger.info(`ℹ️ [grns.resolvers] GRN status updated to ${finalStatus} — grnNo: ${existingGrn.grnNo}`);
                        return transformGrn(updatedGrn ?? grn);
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
                getOldData: async (args, context) => grnsRepository.getGrns({ id: args.id }, undefined, (context as GraphQLContext).organizationId ?? undefined),
            },
            async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
                try {
                    await db.transaction(async (tx) => {
                        const grnResult = await grnsRepository.getGrns({ id }, undefined, context.organizationId ?? undefined);
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
