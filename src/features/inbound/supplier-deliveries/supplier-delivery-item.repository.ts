/** 
 * Supplier Delivery Item Repository
 * 
 * @description Data access layer for Supplier Delivery Item operations.
 */

import { db } from '@/db';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { SupplierDeliveryItemsTable, SupplierDeliveryItemType, SupplierDeliveryItemInsertType } from './supplier-deliveries.model';
import { DbTransaction } from '@/types/db-transaction';

// ============================================
// FILTER TYPES
// ============================================
export type SupplierDeliveryItemFilter = {
    supplierDeliveryId?: string;
    skuId?: string;
    itemId?: string;
}

export class SupplierDeliveryItemsRepositoryClass {
    constructor() {}

    async getSupplierDeliveryItems(filter: SupplierDeliveryItemFilter) {
        try {
            const whereCondition = [];
            if (filter.supplierDeliveryId) {
                whereCondition.push(eq(SupplierDeliveryItemsTable.supplierDeliveryId, filter.supplierDeliveryId));
            }
            if (filter.skuId) {
                whereCondition.push(eq(SupplierDeliveryItemsTable.skuId, filter.skuId));
            }
            if (filter.itemId) {
                whereCondition.push(eq(SupplierDeliveryItemsTable.itemId, filter.itemId));
            }
            const result = await db
                .select()
                .from(SupplierDeliveryItemsTable)
                .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);
            return result;
        } catch (error) {
            logger.error('❌ [SupplierDeliveryItemsRepository.getSupplierDeliveryItems] Error:', error);
            return false;
        }
    } 

    async createSupplierDeliveryItem(data: Omit<SupplierDeliveryItemInsertType, 'id' | 'createdAt' | 'updatedAt'>, tx?: DbTransaction): Promise<SupplierDeliveryItemType> {
        try {
            const client = tx ?? db;
            const [created] = await client.insert(SupplierDeliveryItemsTable).values(data).returning();
            if (!created) throw new Error('Failed to create supplier delivery item: no row returned');
            return created;
        } catch (error) {
            logger.error('❌ [SupplierDeliveryItemsRepository.createSupplierDeliveryItem] Error:', error);
            throw error;
        }
    }

    async updateSupplierDeliveryItem(id: string, data: Partial<SupplierDeliveryItemInsertType>, tx?: DbTransaction): Promise<SupplierDeliveryItemType | null> {
        try {
            const client = tx ?? db;
            const result = await client.update(SupplierDeliveryItemsTable).set(data).where(eq(SupplierDeliveryItemsTable.id, id)).returning();
            return result[0];
        } catch (error) {
            logger.error('❌ [SupplierDeliveryItemsRepository.updateSupplierDeliveryItem] Error:', error);
            return null;
        }
    }

    async deleteSupplierDeliveryItem(id: string, tx?: DbTransaction): Promise<boolean> {
        try {
            const client = tx ?? db;
            await client.delete(SupplierDeliveryItemsTable).where(eq(SupplierDeliveryItemsTable.id, id));
            return true;
        } catch (error) {
            logger.error('❌ [SupplierDeliveryItemsRepository.deleteSupplierDeliveryItem] Error:', error);
            return false;
        }
    }

    /** Delete all items for a supplier delivery (call before deleting the delivery). */
    async deleteSupplierDeliveryItemsByDeliveryId(supplierDeliveryId: string, tx?: DbTransaction): Promise<boolean> {
        try {
            const client = tx ?? db;
            await client.delete(SupplierDeliveryItemsTable).where(eq(SupplierDeliveryItemsTable.supplierDeliveryId, supplierDeliveryId));
            return true;
        } catch (error) {
            logger.error('❌ [SupplierDeliveryItemsRepository.deleteSupplierDeliveryItemsByDeliveryId] Error:', error);
            return false;
        }
    }
}