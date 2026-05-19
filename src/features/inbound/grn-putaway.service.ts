import { db } from '@/db';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { GrnItemsRepositoryClass } from './grns-items.repository';
import { PickFaceStrategyRepositoryClass } from '../master-data/pick-face-strategy.repository';

export class GrnPutawayService {
    constructor(
        private readonly grnItemsRepository: GrnItemsRepositoryClass,
        private readonly pickFaceStrategyRepository: PickFaceStrategyRepositoryClass,
    ) {}

    /**
     * Assigns pick face bins to all items in a GRN.
     * For each item, looks up the SKU's active FIXED_BIN pick face strategy
     * and updates grn_items.rackId to the designated bin.
     * Returns the count of items updated.
     */
    async assignBinsForGrn(grnId: string, organizationId: string): Promise<number> {
        logger.info(`ℹ️ [GrnPutawayService.assignBinsForGrn] Assigning bins for GRN ${grnId}...`);
        try {
            const result = await db.transaction(async (tx) => {
                const grnItemsResult = await this.grnItemsRepository.getGrnItems({ grnId }, tx);
                const grnItems = grnItemsResult === false ? [] : grnItemsResult;
                if (grnItems.length === 0) {
                    logger.warn(`⚠️ [GrnPutawayService.assignBinsForGrn] No items found for GRN ${grnId}`);
                    return 0;
                }

                let updatedCount = 0;
                for (const item of grnItems) {
                    if (!item.skuId) continue;

                    const strategy = await this.pickFaceStrategyRepository.getActiveBySkuId(
                        item.skuId,
                        organizationId,
                        tx
                    );

                    if (!strategy || strategy.binType !== 'FIXED_BIN') continue;

                    await this.grnItemsRepository.updateGrnItem(item.id, {
                        ...item,
                        rackId: strategy.storageBinId,
                    });
                    updatedCount++;
                }

                logger.info(`✅ [GrnPutawayService.assignBinsForGrn] Updated ${updatedCount} items`);
                return updatedCount;
            });

            return result;
        } catch (error) {
            logger.error('❌ [GrnPutawayService.assignBinsForGrn] Error:', error);
            throw error;
        }
    }
}
