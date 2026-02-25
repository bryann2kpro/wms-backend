/**
 * GRN Items Repository
 * 
 * @description Data access layer for GRN Items (Goods Received Note Items) operations.
 */

import { db } from '@/db';
import { GrnItemsTable } from '../grns.model';
import { SkuTable } from '@/features/master-data/sku.model';
import { eq, and, like, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';

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

    async getGrnItems(filter: GrnItemsFilter) {
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

            const baseQuery = db.select().from(GrnItemsTable).where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

            const data = await baseQuery;
            logger.info('✅ [GrnItemsRepository.getGrnItems] GRN Items fetched successfully');
            return data;
        }catch(error){
            logger.error('❌ [GrnItemsRepository.getGrnItems] Error:', error);
            return false;
        }
    }

    async createGrnItem(data: GrnItemsInsertType) {
        try{
            const [grnItem] = await db.insert(GrnItemsTable).values(data).returning();
            logger.info('✅ [GrnItemsRepository.createGrnItem] GRN Item created successfully');
            return grnItem;
        }catch(error){
            logger.error('❌ [GrnItemsRepository.createGrnItem] Error:', error);
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