/**
 * GRN Repository
 * 
 * @description Data access layer for GRN (Goods Received Note) operations.
 */

import { db } from '@/db';
import { GrnsTable, GrnInsertType, GrnType } from './grns.model';
import { SupplierDeliveriesTable } from './supplier-deliveries/supplier-deliveries.model';
import { eq, and, or, like, ilike, desc, asc, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';
import { pagination, PgQueryType } from '@/util/pagination';
import type { DbTransaction } from '@/types/db-transaction';

// ============================================
// FILTER TYPES
// ============================================
export type GrnFilter = {
    id?: string;
    grnNo?: string;
    /** Search across GRN number, PO reference, and Supplier DO (case-insensitive). */
    search?: string;
    status?: string;
    /** Sort field: GRN_NO, UPDATED_AT, CREATED_AT, STATUS, RECEIVED_AT. Default: UPDATED_AT */
    sortBy?: string;
    /** ASC or DESC. Default: DESC */
    sortOrder?: string;
};

export class GrnsRepositoryClass {
    constructor() { }

    async getGrns(filter: GrnFilter, paginationParams?: PaginationParams, organizationId?: string): Promise<PaginatedResponse<any> | false> {
        try {
            const whereCondition = [];
            if (organizationId) {
                whereCondition.push(eq(GrnsTable.organizationId, organizationId));
            }
            if (filter.id) {
                whereCondition.push(eq(GrnsTable.id, filter.id));
            }
            if (filter.grnNo && !filter.search) {
                whereCondition.push(like(GrnsTable.grnNo, `%${filter.grnNo}%`));
            }
            if (filter.search) {
                const term = `%${filter.search.trim()}%`;
                const searchConds = [
                    ilike(GrnsTable.grnNo, term),
                    ilike(GrnsTable.poNo, term),
                ];
                const matchingSdIds = await db
                    .select({ id: SupplierDeliveriesTable.id })
                    .from(SupplierDeliveriesTable)
                    .where(organizationId ? and(ilike(SupplierDeliveriesTable.supplierDeliveryNo, term), eq(SupplierDeliveriesTable.organizationId, organizationId)) : ilike(SupplierDeliveriesTable.supplierDeliveryNo, term));
                const sdIds = matchingSdIds.map((r) => r.id).filter(Boolean);
                if (sdIds.length > 0) {
                    searchConds.push(inArray(GrnsTable.supplierDeliveryId, sdIds));
                }
                whereCondition.push(or(...searchConds)!);
            }
            if (filter.status) {
                whereCondition.push(eq(GrnsTable.status, filter.status));
            }

            const sortOrder = filter.sortOrder?.toUpperCase() === 'ASC' ? asc : desc;
            const sortBy = (filter.sortBy?.toUpperCase() ?? 'UPDATED_AT') as string;
            const orderByColumn =
                sortBy === 'GRN_NO' ? GrnsTable.grnNo
                : sortBy === 'CREATED_AT' ? GrnsTable.createdAt
                : sortBy === 'STATUS' ? GrnsTable.status
                : sortBy === 'RECEIVED_AT' ? GrnsTable.receivedAt
                : GrnsTable.updatedAt;

            const baseQuery = db
                .select()
                .from(GrnsTable)
                .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)
                .orderBy(sortOrder(orderByColumn));
            if (!paginationParams || (!paginationParams.pageSize && !paginationParams.pageNumber)) {
                const data = await baseQuery;
                const totalCount = data.length;
                logger.info('✅ [GrnsRepository.getGrns] GRNs fetched successfully (no pagination)');
                return {
                    query: data,
                    pagination: {
                        count: totalCount,
                        totalCount,
                        currentPage: 1,
                        totalPages: 1,
                        hasNextPage: false,
                        hasPrevPage: false,
                    },
                };
            }
            const pageSize = paginationParams.pageSize || 10;
            const pageNumber = paginationParams.pageNumber || 1;
            const totalCount = (await baseQuery).length;
            const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
            const data = await paginatedQuery.query;

            logger.info('✅ [GrnsRepository.getGrns] GRNs fetched successfully');
            return { query: data, pagination: paginatedQuery.pagination };
        }
        catch (error) {
            logger.error('❌ [GrnsRepository.getGrns] Error:', error);
            return false;
        }
    }

    async createGrn(data: Omit<GrnInsertType, 'id' | 'createdAt' | 'updatedAt'>, tx?: DbTransaction): Promise<GrnType> {
        try {
            const client = tx ?? db;
            const [grn] = await client.insert(GrnsTable).values(data).returning();

            logger.info('✅ [GrnsRepository.createGrn] GRN created successfully');
            return grn;
        } catch (error) {
            logger.error('❌ [GrnsRepository.createGrn] Error:', error);
            throw error;
        }
    }

    async updateGrn(id: string, data: Partial<GrnInsertType>, tx?: DbTransaction): Promise<GrnType | null> {
        try {
            const client = tx ?? db;
            const [grn] = await client.update(GrnsTable).set({ ...data, updatedAt: new Date() }).where(eq(GrnsTable.id, id)).returning();
            logger.info('✅ [GrnsRepository.updateGrn] GRN updated successfully');
            return grn;
        } catch (error) {
            logger.error('❌ [GrnsRepository.updateGrn] Error:', error);
            throw error;
        }
    }

    async deleteGrn(id: string, tx?: DbTransaction): Promise<boolean> {
        try {
            const client = tx ?? db;
            await client.delete(GrnsTable).where(eq(GrnsTable.id, id));
            logger.info('✅ [GrnsRepository.deleteGrn] GRN deleted successfully');
            return true;
        } catch (error) {
            logger.error('❌ [GrnsRepository.deleteGrn] Error:', error);
            return false;
        }
    }
}