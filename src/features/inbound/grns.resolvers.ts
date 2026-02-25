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
import type { GrnItemsType } from './grn_items/grns_items.repository';

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

function transformGrnItem(item: GrnItemsType) {
    return {
        id: item.id,
        grnId: item.grnId,
        skuId: item.skuId,
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
            return result.map(transformGrnItem);
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
                createdBy: string; 
                updatedBy?: string | null; 
                items?: Array<{ skuId?: string | null; qty: string; remarks?: string | null; skuCode?: string | null; skuDescription?: string | null; skuUom?: string | null }> | null;
            } }, context: GraphQLContext) => {
                try {
                    const createdBy = input.createdBy ?? context.user?.id ?? 'system';
                    if(!createdBy){
                        logger.error('[grns.resolvers]: Data created failed caused by user not found.');
                        return false;
                    };
                    const grn = await grnsRepository.createGrn({
                        grnNo: input.grnNo,
                        supplierId: input.supplierId,
                        supplierDeliveryId: input.supplierDeliveryId ?? undefined,
                        poNo: input.poNo ?? undefined,
                        createdBy,
                        updatedBy: context.user?.id ?? undefined,
                        status: 'Draft',
                        receivedAt: input.receivedAt != null ? new Date(input.receivedAt) : null,
                    });
                    if (!grn) {
                        return false;
                    }
                    const updatedBy = context.user?.id ?? undefined;
                    if (input.items?.length) {
                        for (const item of input.items) {
                            let skuIdToUse: string | null = null;
                            if (item.skuId) {
                                const existingSku = await skuRepository.getSkuById(item.skuId);
                                skuIdToUse = existingSku ? existingSku.skuId : null;
                            }
                            if (!skuIdToUse && item.skuCode && item.skuDescription && item.skuUom) {
                                try {
                                    const newSku = await skuRepository.createSku({
                                        skuCode: item.skuCode,
                                        skuDescription: item.skuDescription,
                                        skuQuantity: item.qty,
                                        skuUom: item.skuUom,
                                        isActive: true,
                                        createdBy,
                                        updatedBy: updatedBy ?? createdBy,
                                    } as Parameters<typeof skuRepository.createSku>[0]);
                                    skuIdToUse = newSku.skuId;
                                } catch (err) {
                                    logger.error('[grns.resolvers]: Failed to create new SKU for GRN item', { skuCode: item.skuCode, err });
                                }
                            }
                            if (!skuIdToUse) {
                                logger.error('[grns.resolvers]: SKU not found and cannot create (provide skuId or skuCode, skuDescription, skuUom)', { item });
                                continue;
                            }
                            const created = await grnItemsRepository.createGrnItem({
                                grnId: grn.id,
                                skuId: skuIdToUse,
                                qty: item.qty,
                                remarks: item.remarks ?? undefined,
                                createdBy,
                                updatedBy: updatedBy ?? undefined,
                            });
                            if (!created) {
                                logger.error('[grns.resolvers]: Failed to create GRN item', { skuId: skuIdToUse });
                            }
                        }
                    }
                    return transformGrn(grn);
                } catch (error) {
                    logger.error('[grns.resolvers] Error:', error);
                    return false;
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
                    const grn = await grnsRepository.updateGrn(id, updateData);
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
