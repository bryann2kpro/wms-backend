/**
 * GRN Items Repository
 * 
 * @description Data access layer for GRN Items (Goods Received Note Items) operations.
 */

import { db } from '@/db';
import { GrnItemsTable, GrnsTable } from './grns.model';
import { eq, and, or, gt, sql, desc, asc, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import type { DbTransaction } from '@/types/db-transaction';
import { SkuTable } from '@/features/master-data/sku.model';
import { SuppliersTable } from '@/features/master-data/suppliers.model';
import { EndUserTable } from '@/features/master-data/enduser.model';

export type GrnItemsType = typeof GrnItemsTable.$inferSelect;
export type GrnItemsInsertType = typeof GrnItemsTable.$inferInsert;

// ============================================
// FILTER TYPES
// ============================================

export type GrnItemsFilter = {
    id?: string;
    grnId?: string;
    skuId?: string;
}

export class GrnItemsRepositoryClass {
    constructor() {}

    async getGrnItems(filter: GrnItemsFilter, tx?: DbTransaction) {
        try{
            const whereCondition = [];
            if(filter.id){
                whereCondition.push(eq(GrnItemsTable.id, filter.id));
            }
            if(filter.grnId){
                whereCondition.push(eq(GrnItemsTable.grnId, filter.grnId));
            }
            if(filter.skuId){
                whereCondition.push(eq(GrnItemsTable.skuId, filter.skuId));
            }

            const client = tx ?? db;
            const data = await client.select().from(GrnItemsTable).where(whereCondition.length > 0 ? and(...whereCondition) : undefined);
            logger.info('✅ [GrnItemsRepository.getGrnItems] GRN Items fetched successfully');
            return data;
        }catch(error){
            logger.error('❌ [GrnItemsRepository.getGrnItems] Error:', error);
            return false;
        }
    }

    /**
     * Full item context for every GRN that has at least one line still owing qty against
     * its PO/ASN — i.e. GRNs are the unit of "is this outstanding", but once a GRN
     * qualifies, ALL of its lines come back (fulfilled lines included) so the report can
     * show the whole GRN together instead of isolated, context-less rows.
     */
    async getRemainingItems(organizationId: string) {
        try {
            const qualifyingGrnIds = db
                .select({ grnId: GrnItemsTable.grnId })
                .from(GrnItemsTable)
                .innerJoin(GrnsTable, eq(GrnItemsTable.grnId, GrnsTable.id))
                .where(
                    and(
                        eq(GrnsTable.organizationId, organizationId),
                        or(
                            gt(sql`${GrnItemsTable.remainingCtn}::numeric`, 0),
                            gt(sql`${GrnItemsTable.remainingLoosePcs}::numeric`, 0),
                        ),
                    ),
                );

            const rows = await db
                .select({
                    grnId: GrnsTable.id,
                    grnNo: GrnsTable.grnNo,
                    poNo: GrnsTable.poNo,
                    receivedAt: GrnsTable.receivedAt,
                    supplierName: SuppliersTable.supplierName,
                    endUserName: EndUserTable.userName,
                    skuCode: SkuTable.skuCode,
                    skuDescription: SkuTable.skuDescription,
                    remainingCtn: GrnItemsTable.remainingCtn,
                    remainingLoosePcs: GrnItemsTable.remainingLoosePcs,
                })
                .from(GrnItemsTable)
                .innerJoin(GrnsTable, eq(GrnItemsTable.grnId, GrnsTable.id))
                .innerJoin(SkuTable, eq(GrnItemsTable.skuId, SkuTable.skuId))
                .leftJoin(SuppliersTable, eq(GrnsTable.supplierId, SuppliersTable.supplierId))
                .leftJoin(EndUserTable, eq(GrnsTable.endUserId, EndUserTable.endUserId))
                .where(inArray(GrnItemsTable.grnId, qualifyingGrnIds))
                .orderBy(desc(GrnsTable.receivedAt), asc(SkuTable.skuCode));
            logger.info('✅ [GrnItemsRepository.getRemainingItems] Remaining items fetched successfully');
            return rows;
        } catch (error) {
            logger.error('❌ [GrnItemsRepository.getRemainingItems] Error:', error);
            return [];
        }
    }

    /** Insert one or more GRN items in one query */
    async createGrnItems(items: GrnItemsInsertType[], tx?: DbTransaction): Promise<GrnItemsType[]> {
        if (items.length === 0) return [];
        try {
            const client = tx ?? db;
            const inserted = await client.insert(GrnItemsTable).values(items).returning();
            logger.info('✅ [GrnItemsRepository.createGrnItems] GRN Items created successfully', { count: inserted.length });
            return inserted;
        } catch (error) {
            logger.error('❌ [GrnItemsRepository.createGrnItems] Error:', error);
            throw error;
        }
    }

    async updateGrnItem(id: string, data: GrnItemsInsertType) {
        try{
            const [grnItem] = await db.update(GrnItemsTable).set(data).where(eq(GrnItemsTable.id, id)).returning();
            logger.info('✅ [GrnItemsRepository.updateGrnItem] GRN Item updated successfully');
            return grnItem;
        }catch(error){
            logger.error('❌ [GrnItemsRepository.updateGrnItem] Error:', error);
            return false;
        }
    }

    /**
     * Delete GRN item(s). Use id for a single item, or grnId to delete all items for a GRN.
     * Uses a transaction when no tx is passed so multiple deletes are atomic.
     */
    async deleteGrnItem(params: { id?: string; grnId?: string }, tx?: DbTransaction): Promise<boolean> {
        const run = async (client: DbTransaction) => {
            if (params.id) {
                await client.delete(GrnItemsTable).where(eq(GrnItemsTable.id, params.id));
                logger.info('✅ [GrnItemsRepository.deleteGrnItem] GRN Item deleted successfully');
            } else if (params.grnId) {
                await client.delete(GrnItemsTable).where(eq(GrnItemsTable.grnId, params.grnId));
                logger.info('✅ [GrnItemsRepository.deleteGrnItem] GRN Items deleted successfully', { grnId: params.grnId });
            } else {
                throw new Error('deleteGrnItem requires id or grnId');
            }
        };

        try {
            if (tx) {
                await run(tx);
            } else {
                await db.transaction(async (transaction) => {
                    await run(transaction as DbTransaction);
                });
            }
            return true;
        } catch (error) {
            logger.error('❌ [GrnItemsRepository.deleteGrnItem] Error:', error);
            return false;
        }
    }
}