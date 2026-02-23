/**
 * Report GraphQL Resolvers
 *
 * @description Resolvers for generating report PDFs (Movement Report, Invoices Summary).
 */

import { logger } from '@/util/logger';
import {
  getMovementReportData,
  getInvoiceSummaryData,
  renderMovementReportHtml,
  generateMovementReportPdf,
  generateInvoiceSummaryPdf,
} from './report.service';

export const resolvers = {
  Mutation: {
    /**
     * Generate a report PDF. Returns base64-encoded PDF and filename for download.
     */
    generateReport: async (
      _: unknown,
      args: {
        input: {
          type: 'INVOICE_SUMMARY' | 'MOVEMENT_REPORT';
          dateFrom?: string;
          dateTo?: string;
          format?: 'PDF' | 'EXCEL';
          region: string;
        };
      }
    ) => {
      logger.info('ℹ️ [report.resolvers.generateReport] Generating report...');
      const { type, dateFrom, dateTo, format, region } = args.input;

      logger.debug('🔎 [report.resolvers.generateReport] Report type: %s', type);
      logger.debug('🔎 [report.resolvers.generateReport] Date from: %s', dateFrom);
      logger.debug('🔎 [report.resolvers.generateReport] Date to: %s', dateTo);
      logger.debug('🔎 [report.resolvers.generateReport] Format: %s', format);
      logger.debug('🔎 [report.resolvers.generateReport] Region: %s', region);

      if (type === 'MOVEMENT_REPORT') {
        const rows = getMovementReportData(dateFrom, dateTo);
        // Pump data into the HTML template (use movementReportHtml for preview, email, or HTML→PDF)
        const movementReportHtml = await renderMovementReportHtml(rows, dateFrom, dateTo);
        logger.debug('Movement report HTML rendered, length: %d', movementReportHtml.length);
        return generateMovementReportPdf(rows);
      }

      if (type === 'INVOICE_SUMMARY') {
        const rows = getInvoiceSummaryData(dateFrom, dateTo);
        return generateInvoiceSummaryPdf(rows);
      }

      throw new Error(`Unsupported report type: ${type}`);
    },
  },
};
