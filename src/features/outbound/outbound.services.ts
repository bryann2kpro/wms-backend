import { db } from "@/db";
import { logger } from "@/util/logger";
import { DeliveryOrdersRepositoryClass } from "./delivery-orders.repository";

export class OutboundServices {
    constructor(
        private readonly deliveryOrderRepository: DeliveryOrdersRepositoryClass,
        private readonly deliveryOrderItemRepository: DeliveryOrderItemsRepositoryClass,
    ) {}

    private async createDeliveryOrder(data: any) {
        logger.info('ℹ️ [OutboundServices.createDeliveryOrder] Creating delivery order...');
        try {
            logger.info('ℹ️ [OutboundServices.createDeliveryOrder] Starting Delivery Order Flow...');
            const createdBy = data.userId;
            const updatedBy = data.userId;
            const deliveryDate = new Date();
            await db.transaction(async (tx) => {
                logger.info('ℹ️ [OutboundServices.createDeliveryOrder] Step 1: Create Delivery Order...');
                const deliveryOrder = await this.deliveryOrderRepository.createDeliveryOrder({
                    deliveryOrderNo: data.deliveryOrderNo,
                    deliveryOrderDate: deliveryDate,
                    deliveryOrderStatus: 'CREATED',
                }, tx);
                logger.info('ℹ️ [OutboundServices.createDeliveryOrder] Delivery Order created successfully');
                logger.info('ℹ️ [OutboundServices.createDeliveryOrder] Step 2: Create Delivery Order Items...');
                const deliveryOrderItems = await this.deliveryOrderItemRepository.createDeliveryOrderItems({
                    deliveryOrderId: deliveryOrder.id,
                    deliveryOrderItemStatus: 'CREATED',
                }, tx);
                logger.info('ℹ️ [OutboundServices.createDeliveryOrder] Delivery Order Items created successfully');
            });
            
        } catch (error) {
            logger.error('❌ [OutboundServices.createDeliveryOrder] Error:', error);
            throw error;
        }
    }

}