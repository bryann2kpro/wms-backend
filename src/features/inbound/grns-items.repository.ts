/**
 * GRN Items Repository
 * 
 * @description Data access layer for GRN Items (Goods Received Note Items) operations.
 */

import { db } from '@/db';
import { GrnItemsTable } from './grns.model';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/util/logger';
import type { DbTransaction } from '@/types/db-transaction';

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

    /** Insert one or more GRN items in one query */
    async createGrnItems(items: GrnItemsInsertType[], tx?: DbTransaction): Promise<GrnItemsType[] | false> {
        if (items.length === 0) return [];
        try {
            const client = tx ?? db;
            const inserted = await client.insert(GrnItemsTable).values(items).returning();
            logger.info('✅ [GrnItemsRepository.createGrnItems] GRN Items created successfully', { count: inserted.length });
            return inserted;
        } catch (error) {
            logger.error('❌ [GrnItemsRepository.createGrnItems] Error:', error);
            return false;
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

    async deleteGrnItem(id: string) {
        try{
            await db.delete(GrnItemsTable).where(eq(GrnItemsTable.id, id));
            logger.info('✅ [GrnItemsRepository.deleteGrnItem] GRN Item deleted successfully');
            return true;
        }catch(error){
            logger.error('❌ [GrnItemsRepository.deleteGrnItem] Error:', error);
            return false;
        }
    }
}