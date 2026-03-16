/**
 * Supplier Deliveries Repository
 * 
 * @description Data access layer for Supplier Deliveries operations.
 */

import { db } from '@/db';
import { eq, and, like } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';
import { pagination, PgQueryType } from '@/util/pagination';
import type { DbTransaction } from '@/types/db-transaction';
import { SupplierDeliveriesTable, SupplierDeliveriesType, SupplierDeliveriesInsertType } from './supplier-deliveries.model';
import { suppliersRepository } from '@/composition-root';
// ============================================
// FILTER TYPES
// ============================================
export type SupplierDeliveryFilter = {
    id?: string;
    supplierName?: string;
    supplierCode?: string;
    supplierDeliveryNo?: string;
    deliveryDate?: string;
    transporter?: string;
    lorryPlate?: string;
    account?: string;
    poNo?: string;
    jtNo?: string;
    status?: string;
}

export class SupplierDeliveriesRepositoryClass {
    constructor() { }

    async getSupplierDeliveries(filter: SupplierDeliveryFilter, paginationParams?: PaginationParams, organizationId?: string): Promise<PaginatedResponse<any> | false> {
        try {
            const whereCondition = [];
            if (organizationId) {
                whereCondition.push(eq(SupplierDeliveriesTable.organizationId, organizationId));
            }
            if (filter.id) {
                whereCondition.push(eq(SupplierDeliveriesTable.id, filter.id));
            }
            if (filter.supplierCode) {
                try {
                    const supplier = await suppliersRepository.getSupplierByCode(filter.supplierCode);
                    if (supplier) {
                        whereCondition.push(eq(SupplierDeliveriesTable.supplierId, supplier.supplierId));
                    }
                } catch (error) {
                    logger.error('❌ [SupplierDeliveriesRepository.getSupplierDeliveries] Error:', error);
                    return false;
                }
            }
            if (filter.supplierName) {
                try {
                    const result = await suppliersRepository.getSupplier(
                        { supplierName: filter.supplierName },
                        { pageSize: 1, pageNumber: 1 }
                    );
                    const supplier = result.query[0];
                    if (supplier) {
                        whereCondition.push(eq(SupplierDeliveriesTable.supplierId, supplier.supplierId));
                    }
                } catch (error) {
                    logger.error('❌ [SupplierDeliveriesRepository.getSupplierDeliveries] Error:', error);
                    return false;
                }
            }
            if (filter.supplierDeliveryNo) {
                whereCondition.push(eq(SupplierDeliveriesTable.supplierDeliveryNo, filter.supplierDeliveryNo));
            }
            if (filter.deliveryDate) {
                whereCondition.push(eq(SupplierDeliveriesTable.deliveryDate, new Date(filter.deliveryDate)));
            }
            if (filter.transporter) {
                whereCondition.push(eq(SupplierDeliveriesTable.transporter, filter.transporter));
            }
            if (filter.lorryPlate) {
                whereCondition.push(eq(SupplierDeliveriesTable.lorryPlate, filter.lorryPlate));
            }
            if (filter.account) {
                whereCondition.push(eq(SupplierDeliveriesTable.account, filter.account));
            }
            if (filter.poNo) {
                whereCondition.push(eq(SupplierDeliveriesTable.poNo, filter.poNo));
            }
            if (filter.jtNo) {
                whereCondition.push(eq(SupplierDeliveriesTable.jtNo, filter.jtNo));
            }
            if (filter.status) {
                whereCondition.push(eq(SupplierDeliveriesTable.status, filter.status));
            }
            const baseQuery = db
                .select()
                .from(SupplierDeliveriesTable)
                .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);
            const pageSize = paginationParams?.pageSize || 10;
            const pageNumber = paginationParams?.pageNumber || 1;
            const totalCount = (await baseQuery).length;
            const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
            const data = await paginatedQuery.query;
            return { query: data, pagination: paginatedQuery.pagination };
        } catch (error) {
            logger.error('❌ [SupplierDeliveriesRepository.getSupplierDeliveries] Error:', error);
            return false;
        }
    }

    async createSupplierDelivery(data: Omit<SupplierDeliveriesInsertType, 'id' | 'createdAt' | 'updatedAt'>, tx?: DbTransaction): Promise<SupplierDeliveriesType> {
        try {
            const client = tx ?? db;
            const [created] = await client.insert(SupplierDeliveriesTable).values(data).returning();
            if (!created) throw new Error('Failed to create supplier delivery: no row returned');
            return created;
        } catch (error) {
            logger.error('❌ [SupplierDeliveriesRepository.createSupplierDelivery] Error:', error);
            throw error;
        }
    }

    async updateSupplierDelivery(id: string, data: Partial<SupplierDeliveriesInsertType>, tx?: DbTransaction): Promise<SupplierDeliveriesType | null> {
        try {
            const client = tx ?? db;
            const result = await client.update(SupplierDeliveriesTable).set(data).where(eq(SupplierDeliveriesTable.id, id)).returning();
            return result[0];
        } catch (error) {
            logger.error('❌ [SupplierDeliveriesRepository.updateSupplierDelivery] Error:', error);
            return null;
        }
    }

    async deleteSupplierDelivery(id: string, tx?: DbTransaction): Promise<boolean> {
        try {
            const client = tx ?? db;
            await client.delete(SupplierDeliveriesTable).where(eq(SupplierDeliveriesTable.id, id));
            return true;
        } catch (error) {
            logger.error('❌ [SupplierDeliveriesRepository.deleteSupplierDelivery] Error:', error);
            return false;
        }
    }
}