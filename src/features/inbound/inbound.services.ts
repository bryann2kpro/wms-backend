import { GrnItemsRepositoryClass } from "./grns-items.repository";
import { GrnsRepositoryClass } from "./grns.repository";
import { SupplierDeliveryItemsRepositoryClass } from "./supplier-deliveries/supplier-delivery-item.repository";
import { WarehousesRepositoryClass } from "@/features/master-data/warehouses.repository";
import { SupplierDeliveriesRepositoryClass } from "./supplier-deliveries/supplier-deliveries.repository";
import { logger } from "@/util/logger";
import { db } from "@/db";
import { SkuRepositoryClass } from "../master-data/sku.repository";


export class InboundServices {
    constructor(
        private readonly grnsRepository: GrnsRepositoryClass,
        private readonly skuRepository: SkuRepositoryClass,
    ) {}

    // Replace the data type with the actual type
    async createInbound(data: any): Promise<boolean> {
        logger.info('ℹ️ [InboundServices.createInbound] Creating inbound...');

        const { userId, inboundQty } = data;
        if (!userId) {
            logger.error('❌ [InboundServices.createInbound] User ID is required');
            return false;
        }
        
        const result = await db.transaction(async (tx) => {
            try {
                logger.info('ℹ️ [InboundServices.createInbound] Starting Inbound Flow...');
                // @JUNYU, Move Step 1 to Step 4 from createGRN resolver to here
                const grn = await this.grnsRepository.createGrn(data, tx);


                // Step 5: Update Inventory Balance
                logger.info('ℹ️ [InboundServices.createInbound] Updating inventory balance...');
                const inventoryBalance = await this.skuRepository.updateSku(grn.id, {
                    skuQuantity: inboundQty.toString(), // TJ: DATA SANITIZATION MUST BE DONE AT RESOLVER!
                    updatedBy: userId,
                    updatedAt: new Date(),
                }, tx);
                logger.info('✅ [InboundServices.createInbound] Inventory balance updated successfully');

                logger.info('✅ [InboundServices.createInbound] Inbound Flow completed successfully');
                return true;
            } catch (error) {
                logger.error('❌ [InboundServices.createInbound] Error:', error);
                return false;
            }
        });

        if (!result) {
            logger.error('❌ [InboundServices.createInbound] Failed to create inbound');
        } else {
            logger.info('✅ [InboundServices.createInbound] Inbound created successfully');
        }

        return result;
    }

    // TJ to confirm if this is needed
    async updateInbound(data: any): Promise<boolean> {
        // logger.info('ℹ️ [InboundServices.updateInbound] Updating inbound...');

        // const { userId, inboundQty } = data;
        // if (!userId) {
        //     logger.error('❌ [InboundServices.updateInbound] User ID is required');
        //     return false;
        // }

        return true;
    }
}

