/**
 * Documents GraphQL Resolvers
 *
 * @description Resolvers for document generation (Delivery Order PDF, etc.).
 */

import { logger } from '@/util/logger';
import { runBulkDeliveryOrderPdfJob } from './bulk-delivery-order-pdf.service';
import { generateDeliveryOrderPdf } from './documents.service';

export const resolvers = {
  Mutation: {
    generateDeliveryOrderPdf: async (_: unknown, args: { deliveryOrderId: string }) => {
      logger.info('ℹ️ [documents.resolvers.generateDeliveryOrderPdf] deliveryOrderId: %s', args.deliveryOrderId);
      const s3Url = await generateDeliveryOrderPdf(args.deliveryOrderId);
      return { s3Url };
    },

    bulkGenerateDeliveryOrdersPdf: async (_: unknown, args: { deliveryOrderIds: string[] }) => {
      if (args.deliveryOrderIds.length === 0) throw new Error('No delivery order IDs provided');
      if (args.deliveryOrderIds.length > 500) throw new Error('Maximum 500 delivery orders per bulk export');

      const jobId = crypto.randomUUID();

      runBulkDeliveryOrderPdfJob(jobId, args.deliveryOrderIds).catch((err) => {
        logger.error('❌ [bulk-delivery-order-pdf] Unhandled job error', err);
      });

      return { jobId };
    },
  },
};
