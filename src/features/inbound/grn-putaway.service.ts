import { db } from '@/db';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { GrnItemsRepositoryClass } from './grns-items.repository';
import { InboundPutawaySuggestionService } from './inbound-putaway-suggestion.service';

export class GrnPutawayService {
    constructor(
        private readonly grnItemsRepository: GrnItemsRepositoryClass,
        private readonly putawaySuggestionService: InboundPutawaySuggestionService,
    ) {}

    /**
     * Assigns pick face bins to all items in a GRN.
     * Uses pick-face default rack when it has capacity; otherwise an empty rack.
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

                    const qty = Math.max(0, Number(item.qty ?? 0));

                    const suggestion = await this.putawaySuggestionService.suggestRack(
                        {
                            organizationId,
                            skuId: item.skuId,
                            quantity: qty,
                        },
                        tx,
                    );

                    if (!suggestion.rackId) continue;

                    await this.grnItemsRepository.updateGrnItem(item.id, {
                        ...item,
                        rackId: suggestion.rackId,
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
