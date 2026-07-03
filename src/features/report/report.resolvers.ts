/**
 * Report GraphQL Resolvers
 *
 * @description Resolvers for generating report PDFs (Movement Report, Invoices Summary).
 */

import { logger } from '@/util/logger';
import { s3Repository } from '@/composition-root';
import {
  getMovementReportData,
  getInvoiceSummaryData,
  generateMovementReportPdf,
  generateInvoiceSummaryPdf,
  generateStockCountChecklistPdf,
  generateDoPickingListPdf,
  generateStockTransferWorkQueuePdf,
  getInventoryBalanceReportData,
  generateStockBalancePdf,
  generateGrnRemainingReportPdf,
  type InventoryBalanceReportType,
} from './report.service';
import z from 'zod';

type DeliveryDateSortOrder = 'ASC' | 'DESC';

const REPORT_TYPE_S3_FOLDER: Record<string, string> = {
  MOVEMENT_REPORT: 'movement',
  INVOICE_SUMMARY: 'invoice-summary',
};

export const resolvers = {
  Query: {
    invoiceSummaryReportData: async (
      _: unknown,
      args: {
        dateFrom: string;
        dateTo: string;
        regionId: string;
        deliveryDateSortOrder?: DeliveryDateSortOrder;
      }
    ) => {
      return getInvoiceSummaryData(
        args.dateFrom,
        args.dateTo,
        args.regionId,
        args.deliveryDateSortOrder
      );
    },

    inventoryBalanceReportData: async (
      _: unknown,
      args: { type: InventoryBalanceReportType },
      context: { organizationId: string }
    ) => {
      return getInventoryBalanceReportData(args.type, context.organizationId);
    },
  },
  Mutation: {
    /**
     * Generate a report PDF. Returns base64-encoded PDF and filename for download.
     * Optionally upload to S3 (saveToS3: true) and get back s3Url.
     */
    generateReport: async (
      _: unknown,
      args: {
        input: {
          type: 'INVOICE_SUMMARY' | 'MOVEMENT_REPORT';
          dateFrom: string;
          dateTo: string;
          format?: 'PDF' | 'EXCEL';
          regionId: string;
          deliveryDateSortOrder?: DeliveryDateSortOrder;
          saveToS3?: boolean;
        };
      }
    ) => {
      logger.info('ℹ️ [report.resolvers.generateReport] Generating report...');
      const { type, dateFrom, dateTo, format, regionId, deliveryDateSortOrder, saveToS3 } = args.input;

      logger.debug('🔎 [report.resolvers.generateReport] Report type: %s', type);
      logger.debug('🔎 [report.resolvers.generateReport] Date from: %s', dateFrom);
      logger.debug('🔎 [report.resolvers.generateReport] Date to: %s', dateTo);
      logger.debug('🔎 [report.resolvers.generateReport] Format: %s', format);
      logger.debug('🔎 [report.resolvers.generateReport] Region ID: %s', regionId);
      logger.debug('🔎 [report.resolvers.generateReport] Delivery date sort order: %s', deliveryDateSortOrder);
      logger.debug('🔎 [report.resolvers.generateReport] Save to S3: %s', saveToS3);

      let result: { pdfBase64: string; filename: string };

      if (type === 'MOVEMENT_REPORT') {
        const rows = await getMovementReportData(dateFrom, dateTo, regionId);
        result = await generateMovementReportPdf(rows, dateFrom, dateTo, regionId);
      } else if (type === 'INVOICE_SUMMARY') {
        const rows = await getInvoiceSummaryData(
          dateFrom,
          dateTo,
          regionId,
          deliveryDateSortOrder
        );
        result = await generateInvoiceSummaryPdf(rows, dateFrom, dateTo, regionId);
      } else {
        throw new Error(`Unsupported report type: ${type}`);
      }

      let s3Url: string | null = null;
      if (saveToS3 && result.pdfBase64) {
        const pdfBuffer = Buffer.from(result.pdfBase64, 'base64');
        const s3Folder = REPORT_TYPE_S3_FOLDER[type] ?? type.toLowerCase();
        s3Url = await s3Repository.uploadReportPdf(pdfBuffer, result.filename, s3Folder);
        s3Url = s3Url || null;
      }

      return {
        pdfBase64: result.pdfBase64,
        filename: result.filename,
        s3Url,
      };
    },

    generateStockCountChecklist: async (
      _: unknown,
      args: { sessionId: string },
      context: { organizationId: string }
    ) => {
      return generateStockCountChecklistPdf(args.sessionId, context.organizationId);
    },

    generateDoPickingList: async (
      _: unknown,
      args: {
        filter?: {
          regionId?: string;
          regionIds?: string[];
          search?: string;
          scheduledDeliveryDateFrom?: string;
          scheduledDeliveryDateTo?: string;
        };
      },
      context: { organizationId: string }
    ) => {
      logger.info('ℹ️ [report.resolvers.generateDoPickingList] Generating DO picking list PDF...');

      const pickingListFilterSchema = z.object({
        regionId: z.uuid().optional(),
        regionIds: z.array(z.uuid()).optional(),
        search: z.string().optional(),
        scheduledDeliveryDateFrom: z.string().optional(),
        scheduledDeliveryDateTo: z.string().optional(),
      }).transform((data) => {
        return {
          ...data,
          regionIds: data.regionId ? [data.regionId] : data.regionIds, // Assuming either regionId or regionIds is provided
        }
      });

      const { success, data: filter, error } = pickingListFilterSchema.safeParse(args.filter);

      if (!success) {
        throw new Error(`Invalid filter: ${z.prettifyError(error)}`);
      }

      return generateDoPickingListPdf(context.organizationId, filter);
    },

    generateStockTransferWorkQueueList: async (
      _: unknown,
      args: { filter?: { search?: string } },
      context: { organizationId: string },
    ) => {
      logger.info(
        'ℹ️ [report.resolvers.generateStockTransferWorkQueueList] Generating work queue PDF...',
      );

      const filterSchema = z.object({
        search: z.string().optional(),
      });

      const { success, data: filter, error } = filterSchema.safeParse(args.filter ?? {});
      if (!success) {
        throw new Error(`Invalid filter: ${z.prettifyError(error)}`);
      }

      return generateStockTransferWorkQueuePdf(context.organizationId, filter);
    },

    generateStockBalanceReport: async (
      _: unknown,
      args: { type: InventoryBalanceReportType },
      context: { organizationId: string }
    ) => {
      logger.info('ℹ️ [report.resolvers.generateStockBalanceReport] Generating stock balance PDF...');
      const rows = await getInventoryBalanceReportData(args.type, context.organizationId);
      return generateStockBalancePdf(rows, args.type);
    },

    generateGrnRemainingReportPdf: async (
      _: unknown,
      __: unknown,
      context: { organizationId: string },
    ) => {
      logger.info('ℹ️ [report.resolvers.generateGrnRemainingReportPdf] Generating GRN remaining report PDF...');
      return generateGrnRemainingReportPdf(context.organizationId);
    },
  },
};
