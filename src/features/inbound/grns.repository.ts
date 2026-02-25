/**
 * GRN Repository
 * 
 * @description Data access layer for GRN (Goods Received Note) operations.
 */

import { db } from '@/db';
import { GrnsTable, GrnInsertType, GrnType } from './grns.model';
import { eq, and, like } from 'drizzle-orm';
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
    status?: string;
}

export class GrnsRepositoryClass {
    constructor() { }

    async getGrns(filter: GrnFilter, paginationParams?: PaginationParams): Promise<PaginatedResponse<any> | false> {
        try {
            const whereCondition = [];
            if (filter.id) {
                whereCondition.push(eq(GrnsTable.id, filter.id));
            }
            if (filter.grnNo) {
                whereCondition.push(like(GrnsTable.grnNo, `%${filter.grnNo}%`));
            }

            if (filter.status) {
                whereCondition.push(eq(GrnsTable.status, filter.status));
            }

            const baseQuery = db.select().from(GrnsTable).where(whereCondition.length > 0 ? and(...whereCondition) : undefined);
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
            if (!grn) {
                throw new Error('Failed to create GRN: no row returned');
            }
            logger.info('✅ [GrnsRepository.createGrn] GRN created successfully');
            return grn;
        } catch (error) {
            logger.error('❌ [GrnsRepository.createGrn] Error:', error);
            throw error;
        }
    }

    async updateGrn(id: string, data: Partial<GrnInsertType>, tx?: DbTransaction): Promise<GrnType | null> {
        try{
            const client = tx ?? db;
            const [grn] = await client.update(GrnsTable).set({ ...data, updatedAt: new Date() }).where(eq(GrnsTable.id, id)).returning();
            logger.info('✅ [GrnsRepository.updateGrn] GRN updated successfully');
            return grn;
        }catch(error){
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