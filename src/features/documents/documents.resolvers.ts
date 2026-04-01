/**
 * Documents GraphQL Resolvers
 *
 * @description Resolvers for document generation (Delivery Order PDF, etc.).
 */

import { logger } from '@/util/logger';
import { generateDeliveryOrderPdf } from './documents.service';

export const resolvers = {
  Mutation: {
    generateDeliveryOrderPdf: async (_: unknown, args: { deliveryOrderId: string }) => {
      logger.info('ℹ️ [documents.resolvers.generateDeliveryOrderPdf] deliveryOrderId: %s', args.deliveryOrderId);
      const s3Url = await generateDeliveryOrderPdf(args.deliveryOrderId);
      return { s3Url };
    },
  },
};
