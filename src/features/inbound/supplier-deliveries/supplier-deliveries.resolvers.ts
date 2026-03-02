/**
 * Supplier Deliveries GraphQL Resolvers
 * 
 * @description Resolver functions for Supplier Deliveries operations.
 * Uses SupplierDeliveriesRepository for data access.
 */

import { skuRepository, supplierDeliveriesRepository, supplierDeliveryItemsRepository } from '@/composition-root';
import { SupplierDeliveryFilter } from './supplier-deliveries.repository';
import { withAudit } from '@/features/audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { 
    SupplierDeliveriesType,
    SupplierDeliveryItemType,
    SupplierDeliveriesInsertType,
    SupplierDeliveryItemInsertType
} from './supplier-deliveries.model';
import { logger } from '@/util/logger';

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformSupplierDelivery(supplierDelivery: SupplierDeliveriesType) {
    return {
        id: supplierDelivery.id,
        supplierId: supplierDelivery.supplierId,
        supplierDeliveryNo: supplierDelivery.supplierDeliveryNo,
        deliveryDate: supplierDelivery.deliveryDate,
        transporter: supplierDelivery.transporter ?? null,
        lorryPlate: supplierDelivery.lorryPlate ?? null,
        invoiceToAddressId: supplierDelivery.invoiceToAddressId ?? null,
        deliverToAddressId: supplierDelivery.deliverToAddressId ?? null,
        account: supplierDelivery.account ?? null,
        poNo: supplierDelivery.poNo ?? null,
        jtNo: supplierDelivery.jtNo ?? null,
        orderDate: supplierDelivery.orderDate ?? null,
        status: supplierDelivery.status,
        createdAt: supplierDelivery.createdAt,
        updatedAt: supplierDelivery.updatedAt,
        createdBy: supplierDelivery.createdBy,
        updatedBy: supplierDelivery.updatedBy ?? null,
    };
}

function transformSupplierDeliveryItem(
    supplierDeliveryItem: SupplierDeliveryItemType,
    skuMap?: Map<string, { skuCode: string | null; skuDescription: string | null }>
) {
    const sku = skuMap?.get(supplierDeliveryItem.skuId);
    const toNum = (v: string | null | undefined): number | null =>
        v == null ? null : Number(v);

    return {
        id: supplierDeliveryItem.id,
        supplierDeliveryId: supplierDeliveryItem.supplierDeliveryId,
        skuId: supplierDeliveryItem.skuId,
        skuCode: sku?.skuCode ?? null,
        skuDescription: sku?.skuDescription ?? null,
        itemId: supplierDeliveryItem.itemId ?? null,
        itemName: supplierDeliveryItem.itemName ?? null,
        qtyDelivered: Number(supplierDeliveryItem.qtyDelivered),
        lossQty: Number(supplierDeliveryItem.lossQty ?? 0),
        qtyOrdered: toNum(supplierDeliveryItem.qtyOrdered ?? undefined),
        qtyToFollow: toNum(supplierDeliveryItem.qtyToFollow ?? undefined),
        remarks: supplierDeliveryItem.remarks ?? null,
        createdAt: supplierDeliveryItem.createdAt,
        updatedAt: supplierDeliveryItem.updatedAt,
        createdBy: supplierDeliveryItem.createdBy,
        updatedBy: supplierDeliveryItem.updatedBy ?? null,
    };
}

export const resolvers = {
    Query: {
        supplierDeliveries: async (_: unknown, args: {
            filter?: SupplierDeliveryFilter;
            pageSize?: number;
            pageNumber?: number;
        }) => {
            try {
                const filter: SupplierDeliveryFilter = args.filter || {};
                if (args.filter) {
                    if (args.filter.id) {
                        filter.id = args.filter.id;
                    }
                    if (args.filter.supplierDeliveryNo) {
                        filter.supplierDeliveryNo = args.filter.supplierDeliveryNo;
                    }
                    if (args.filter.deliveryDate) {
                        filter.deliveryDate = args.filter.deliveryDate;
                    }
                    if (args.filter.transporter) {
                        filter.transporter = args.filter.transporter;
                    }
                    if (args.filter.lorryPlate) {
                        filter.lorryPlate = args.filter.lorryPlate;
                    }
                    if (args.filter.account) {
                        filter.account = args.filter.account;
                    }
                    if (args.filter.poNo) {
                        filter.poNo = args.filter.poNo;
                    }
                    if (args.filter.jtNo) {
                        filter.jtNo = args.filter.jtNo;
                    }
                    if (args.filter.status) {
                        filter.status = args.filter.status;
                    }
                }
                let paginationParams;
                if (args.pageSize && args.pageNumber) {
                    paginationParams = {
                        pageSize: args.pageSize,
                        pageNumber: args.pageNumber,
                    };
                }
                const result = await supplierDeliveriesRepository.getSupplierDeliveries(filter, paginationParams);
                if (!result) return false;
                return {
                    query: result.query.map(transformSupplierDelivery),
                    pagination: result.pagination,
                };
            } catch (error) {
                logger.error('[supplier-deliveries.resolvers] Error:', error);
                return false;
            }
        },
        supplierDelivery: async (_: unknown, { id }: { id: string }) => {
            const result = await supplierDeliveriesRepository.getSupplierDeliveries(
                { id },
                { pageSize: 1, pageNumber: 1 }
            );
            if (!result || result.query.length === 0) {
                throw new Error(`Supplier delivery not found: ${id}`);
            }
            return transformSupplierDelivery(result.query[0]);
        },
    },
    SupplierDelivery: {
        items: async (parent: { id: string }) => {
            const result = await supplierDeliveryItemsRepository.getSupplierDeliveryItems({ supplierDeliveryId: parent.id });
            if (result === false) return [];
            const skuIds = [...new Set(result.map((r) => r.skuId))];
            let skuMap = new Map<string, { skuCode: string | null; skuDescription: string | null }>();
            if (skuIds.length > 0) {
                try{
                    const skuResult = await skuRepository.getSku({ skuId: skuIds });
                    for (const s of skuResult.query) {
                        skuMap.set(s.skuId, { skuCode: s.skuCode ?? null, skuDescription: s.skuDescription ?? null });
                    }
                } catch (error) {
                    logger.error('[grns.resolvers] Error:', error);
                    return false;
                }
            }
            return result.map((item) => transformSupplierDeliveryItem(item, skuMap));
        }
    },
    Mutation: {
        createSupplierDelivery: withAudit(
            {
                entity: 'SupplierDelivery',
                action: 'CREATE',
                getEntityId: (result: SupplierDeliveriesType | false | null): string | null =>
                    result && typeof result === 'object' && 'id' in result ? result.id : null,
            },
            async (_: unknown, { input }: { 
                input: {
                    supplierId: string;
                    supplierDeliveryNo: string;
                    deliveryDate: string;
                    transporter: string | null;
                    lorryPlate: string | null;
                    invoiceToAddressId: string | null;
                    deliverToAddressId: string | null;
                    account: string | null;
                    poNo: string | null;
                    jtNo: string | null;
                    orderDate: string | null;
                    status: string;
                    createdBy: string;
                    updatedBy: string | null;
                    items?: {
                        skuId: string;
                        itemId: string | null;
                        itemName: string | null;
                        qtyDelivered: number;
                        qtyOrdered: number | null;
                        qtyToFollow: number | null;
                        remarks: string | null;
                        createdBy: string;
                        updatedBy: string | null;
                        createdAt: Date;
                        updatedAt: Date;
                    }[] | null;
                } }, context: GraphQLContext) => {
                try {
                    const payload = {
                        ...input,
                        // supplierId: input.supplierId,
                        // TODO: Replace this after testing
                        supplierId: '53233271-d78a-451c-a676-132982542883',
                        deliveryDate: new Date(input.deliveryDate),
                        orderDate: input.orderDate != null ? new Date(input.orderDate) : undefined,
                    };
                    const result = await supplierDeliveriesRepository.createSupplierDelivery(payload, context.tx);
                    logger.info('[supplier-deliveries.resolvers] createSupplierDelivery Success:', result);
                    try{
                        
                    } catch (error) {
                        logger.error('[supplier-deliveries.resolvers] createSupplierDeliveryItem Error:', error);
                        throw error;
                    }
                    return transformSupplierDelivery(result);
                } catch (error) {
                    logger.error('[supplier-deliveries.resolvers] createSupplierDelivery Error:', error);
                    throw error;
                }
            }
        ),

        updateSupplierDelivery: withAudit(
            {
                entity: 'SupplierDelivery',
                action: 'UPDATE',
                getEntityId: (_, args) => args.id,
                getOldData: async (args) => {
                    const r = await supplierDeliveriesRepository.getSupplierDeliveries(
                        { id: args.id },
                        { pageSize: 1, pageNumber: 1 }
                    );
                    return r ? r.query[0] : null;
                },
            },
            async (
                _: unknown,
                args: {
                    id: string;
                    input: {
                        deliveryDate?: string | null;
                        transporter?: string | null;
                        lorryPlate?: string | null;
                        account?: string | null;
                        poNo?: string | null;
                        jtNo?: string | null;
                        orderDate?: string | null;
                        status?: string | null;
                        updatedBy?: string | null;
                        items?: Array<{
                            id: string;
                            skuId?: string | null;
                            itemId?: string | null;
                            itemName?: string | null;
                            qtyDelivered?: number | null;
                            lossQty?: number | null;
                            qtyOrdered?: number | null;
                            qtyToFollow?: number | null;
                            remarks?: string | null;
                            updatedBy?: string | null;
                        }> | null;
                    };
                },
                context: GraphQLContext
            ) => {
                const { id, input } = args;
                const updatedBy = input.updatedBy ?? context.user?.id ?? null;
                const updateData: Partial<SupplierDeliveriesInsertType> = {
                    updatedBy: updatedBy ?? undefined,
                    updatedAt: new Date(),
                };
                if (input.deliveryDate != null) updateData.deliveryDate = new Date(input.deliveryDate);
                if (input.transporter !== undefined) updateData.transporter = input.transporter;
                if (input.lorryPlate !== undefined) updateData.lorryPlate = input.lorryPlate;
                if (input.account !== undefined) updateData.account = input.account;
                if (input.poNo !== undefined) updateData.poNo = input.poNo;
                if (input.jtNo !== undefined) updateData.jtNo = input.jtNo;
                if (input.orderDate !== undefined) updateData.orderDate = input.orderDate != null ? new Date(input.orderDate) : null;
                if (input.status !== undefined) updateData.status = input.status ?? undefined;
                const updated = await supplierDeliveriesRepository.updateSupplierDelivery(id, updateData, context.tx);
                if (!updated) throw new Error(`Failed to update supplier delivery: ${id}`);

                if (input.items?.length) {
                    const itemUpdatedBy = updatedBy ?? context.user?.id ?? undefined;
                    for (const item of input.items) {
                        const itemUpdateData: Partial<SupplierDeliveryItemInsertType> = {
                            updatedBy: (item.updatedBy ?? itemUpdatedBy) ?? undefined,
                            updatedAt: new Date(),
                        };
                        if (item.skuId !== undefined) itemUpdateData.skuId = item.skuId ?? undefined;
                        if (item.itemId !== undefined) itemUpdateData.itemId = item.itemId;
                        if (item.itemName !== undefined) itemUpdateData.itemName = item.itemName;
                        if (item.qtyDelivered !== undefined) itemUpdateData.qtyDelivered = String(item.qtyDelivered);
                        if (item.lossQty !== undefined) itemUpdateData.lossQty = String(item.lossQty);
                        if (item.qtyOrdered !== undefined) itemUpdateData.qtyOrdered = item.qtyOrdered != null ? String(item.qtyOrdered) : null;
                        if (item.qtyToFollow !== undefined) itemUpdateData.qtyToFollow = item.qtyToFollow != null ? String(item.qtyToFollow) : null;
                        if (item.remarks !== undefined) itemUpdateData.remarks = item.remarks;
                        const itemUpdated = await supplierDeliveryItemsRepository.updateSupplierDeliveryItem(item.id, itemUpdateData, context.tx);
                        if (!itemUpdated) throw new Error(`Failed to update supplier delivery item: ${item.id}`);
                    }
                }

                return transformSupplierDelivery(updated);
            }
        ),

        deleteSupplierDelivery: withAudit(
            {
                entity: 'SupplierDelivery',
                action: 'DELETE',
                getEntityId: (_: unknown, args: { id: string }) => args.id,
                getOldData: async (args: { id: string }) => {
                    const r = await supplierDeliveriesRepository.getSupplierDeliveries(
                        { id: args.id },
                        { pageSize: 1, pageNumber: 1 }
                    );
                    return r ? r.query[0] : null;
                },
            },
            async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
                const itemsDeleted = await supplierDeliveryItemsRepository.deleteSupplierDeliveryItemsByDeliveryId(id, context.tx);
                if (!itemsDeleted) throw new Error(`Failed to delete supplier delivery items for delivery: ${id}`);
                const ok = await supplierDeliveriesRepository.deleteSupplierDelivery(id, context.tx);
                if (!ok) throw new Error(`Failed to delete supplier delivery: ${id}`);
                return true;
            }
        ),

        updateSupplierDeliveryItem: withAudit(
            {
                entity: 'SupplierDeliveryItem',
                action: 'UPDATE',
                getEntityId: (_: unknown, args: { id: string }) => args.id,
            },
            async (
                _: unknown,
                { id, input }: {
                    id: string;
                    input: {
                        skuId?: string | null;
                        itemId?: string | null;
                        itemName?: string | null;
                        qtyDelivered?: number | null;
                        lossQty?: number | null;
                        qtyOrdered?: number | null;
                        qtyToFollow?: number | null;
                        remarks?: string | null;
                        updatedBy?: string | null;
                    };
                },
                context: GraphQLContext
            ) => {
                const updatedBy = input.updatedBy ?? context.user?.id ?? null;
                const updateData: Partial<SupplierDeliveryItemInsertType> = {
                    updatedBy: updatedBy ?? undefined,
                    updatedAt: new Date(),
                };
                if (input.skuId !== undefined) updateData.skuId = input.skuId ?? undefined;
                if (input.itemId !== undefined) updateData.itemId = input.itemId;
                if (input.itemName !== undefined) updateData.itemName = input.itemName;
                if (input.qtyDelivered !== undefined) updateData.qtyDelivered = String(input.qtyDelivered);
                if (input.lossQty !== undefined) updateData.lossQty = String(input.lossQty);
                if (input.qtyOrdered !== undefined) updateData.qtyOrdered = input.qtyOrdered != null ? String(input.qtyOrdered) : null;
                if (input.qtyToFollow !== undefined) updateData.qtyToFollow = input.qtyToFollow != null ? String(input.qtyToFollow) : null;
                if (input.remarks !== undefined) updateData.remarks = input.remarks;
                const updated = await supplierDeliveryItemsRepository.updateSupplierDeliveryItem(id, updateData);
                if (!updated) throw new Error(`Failed to update supplier delivery item: ${id}`);
                return transformSupplierDeliveryItem(updated);
            }
        ),

        deleteSupplierDeliveryItem: withAudit(
            {
                entity: 'SupplierDeliveryItem',
                action: 'DELETE',
                getEntityId: (_: unknown, args: { id: string }) => args.id,
            },
            async (_: unknown, { id }: { id: string }) => {
                const ok = await supplierDeliveryItemsRepository.deleteSupplierDeliveryItem(id);
                if (!ok) throw new Error(`Failed to delete supplier delivery item: ${id}`);
                return true;
            }
        ),
    },
}