/**
 * SKU Repository
 * 
 * @description Data access layer for SKU (Stock Keeping Unit) operations.
 */

import { db } from '@/db';
import { SkuTable } from './sku.model';
import { eq } from 'drizzle-orm';
import { logger } from '@/util/logger';

export type SkuType = typeof SkuTable.$inferSelect;
export type SkuInsertType = typeof SkuTable.$inferInsert;

export class SkuRepositoryClass {
  constructor() {}

  /**
   * Get all SKUs
   */
  async getAllSkus(): Promise<SkuType[]> {
    try {
      logger.info('ℹ️ [SkuRepository.getAllSkus] Getting all SKUs...');
      const skus = await db.select().from(SkuTable);
      logger.info('✅ [SkuRepository.getAllSkus] SKUs fetched successfully');
      return skus;
    } catch (error) {
      logger.error('❌ [SkuRepository.getAllSkus] Error:', error);
      throw error;
    }
  }

  /**
   * Get SKU by ID
   */
  async getSkuById(id: string): Promise<SkuType | null> {
    try {
      logger.info('ℹ️ [SkuRepository.getSkuById] Getting SKU by ID...');
      const [sku] = await db
        .select()
        .from(SkuTable)
        .where(eq(SkuTable.skuId, id))
        .limit(1);
      
      logger.info('✅ [SkuRepository.getSkuById] SKU fetched successfully');
      return sku || null;
    } catch (error) {
      logger.error('❌ [SkuRepository.getSkuById] Error:', error);
      throw error;
    }
  }

  /**
   * Create a new SKU
   */
  async createSku(data: Omit<SkuInsertType, 'skuId' | 'createdAt' | 'updatedAt'>): Promise<SkuType> {
    try {
      logger.info('ℹ️ [SkuRepository.createSku] Creating SKU...');
      const [sku] = await db
        .insert(SkuTable)
        .values(data)
        .returning();
      
      logger.info('✅ [SkuRepository.createSku] SKU created successfully');
      return sku;
    } catch (error) {
      logger.error('❌ [SkuRepository.createSku] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing SKU
   */
  async updateSku(id: string, data: Partial<SkuInsertType>): Promise<SkuType | null> {
    try {
      logger.info('ℹ️ [SkuRepository.updateSku] Updating SKU...');
      const [sku] = await db
        .update(SkuTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(SkuTable.skuId, id))
        .returning();
      
      logger.info('✅ [SkuRepository.updateSku] SKU updated successfully');
      return sku || null;
    } catch (error) {
      logger.error('❌ [SkuRepository.updateSku] Error:', error);
      throw error;
    }
  }

  /**
   * Delete a SKU
   */
  async deleteSku(id: string): Promise<boolean> {
    try {
      logger.info('ℹ️ [SkuRepository.deleteSku] Deleting SKU...');
      await db.delete(SkuTable).where(eq(SkuTable.skuId, id));
      logger.info('✅ [SkuRepository.deleteSku] SKU deleted successfully');
      return true;
    } catch (error) {
      logger.error('❌ [SkuRepository.deleteSku] Error:', error);
      throw error;
    }
  }
}
