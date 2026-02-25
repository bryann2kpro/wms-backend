/**
 * GRN GraphQL Resolvers
 *  
 * @description Resolver functions for GRN (Goods Received Note) operations.
 * Uses GrnsRepository for data access (proper layer separation).
 * 
 * Type definitions are in grns.typeDefs.ts
 */

import { grnsRepository, grnItemsRepository, skuRepository } from '@/composition-root';
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
            filter?: GrnFilter;
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
                let paginationParams;
                if (args.pageSize && args.pageNumber) {
                    paginationParams = { pageSize: args.pageSize, pageNumber: args.pageNumber };
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
            async (_: unknown, { input }: { input: { 
                grnNo: string;
                supplierId: string; 
                supplierDeliveryId?: string | null; 
                poNo?: string | null; 
                receivedAt?: string | null; 
                approvedBy?: string | null; 
                status?: string | null;
                createdBy: string;
                updatedBy?: string | null; 
                items?: Array<{ skuId?: string | null; qty: string; remarks?: string | null; skuCode?: string | null; skuDescription?: string | null; skuUom?: string | null }> | null;
            } }, context: GraphQLContext) => {
                try {
                    const createdBy = input.createdBy ?? context.user?.id;
                    if (!createdBy) {
                        throw new Error('createdBy is required (or provide an authenticated user)');
                    }
                    const grn = await grnsRepository.createGrn({
                        grnNo: input.grnNo,
                        // supplierId: input.supplierId,
                        // for testing purpose,
                        supplierId: 'b3e317c5-4bec-49aa-82f3-0a83115a8e70',
                        supplierDeliveryId: input.supplierDeliveryId ?? undefined,
                        poNo: input.poNo ?? undefined,
                        createdBy,
                        updatedBy: context.user?.id ?? undefined,
                        status: input.status ?? 'Draft',
                        receivedAt: input.receivedAt != null ? new Date(input.receivedAt) : null,
                    }, context.tx);
                    const updatedBy = context.user?.id ?? undefined;
                    // GRN items: resolve skuId for each item (existing or create new SKU), then batch insert all items
                    if (input.items?.length) {
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
                                logger.error('[grns.resolvers]: SKU not found and cannot create (provide valid skuId or skuCode, skuDescription, skuUom)', { item });
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

                        if (grnItemRows.length > 0) {
                            const created = await grnItemsRepository.createGrnItems(grnItemRows, context.tx);
                            if (created === false) {
                                logger.error('[grns.resolvers]: Failed to create GRN items batch');
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
                getOldData: async (args) => {
                    return await grnsRepository.getGrns({ id: args.id });
                },
            },
            async (_: unknown, { id, input }: { id: string; input: {
                grnNo?: string | null;
                supplierId?: string | null;
                supplierDeliveryId?: string | null;
                poNo?: string | null;
                receivedAt?: string | null;
                approvedBy?: string | null;
                approvedAt?: string | null;
                status?: string | null;
                updatedBy?: string | null;
                updatedAt?: Date;
            } }, context: GraphQLContext) => {
                try {
                    const updatedBy = input.updatedBy ?? context.user?.id;
                    if(!updatedBy){
                        logger.error('[grns.resolvers]: Data updated failed caused by user not found.');
                        return false;
                    }
                    const updateData: Record<string, unknown> = {
                        updatedBy,
                    };
                    if(input.grnNo !== undefined) updateData.grnNo = input.grnNo;
                    if(input.supplierId !== undefined) updateData.supplierId = input.supplierId;
                    if(input.supplierDeliveryId !== undefined) updateData.supplierDeliveryId = input.supplierDeliveryId;
                    if(input.poNo !== undefined) updateData.poNo = input.poNo;
                    if(input.receivedAt !== undefined) updateData.receivedAt = input.receivedAt != null ? new Date(input.receivedAt) : null;
                    if(input.approvedBy !== undefined) updateData.approvedBy = input.approvedBy;
                    if(input.approvedAt !== undefined) updateData.approvedAt = input.approvedAt != null ? new Date(input.approvedAt) : null;
                    if(input.status !== undefined) updateData.status = input.status;

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

                    const grn = await grnsRepository.updateGrn(id, updateData, context.tx);
                    if(!grn){
                        return false;
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
                    await grnsRepository.deleteGrn(id);
                    return true;
                } catch (error) {
                    logger.error('[grns.resolvers] Error:', error);
                    return false;
                }
            }
        ),
    },
};
