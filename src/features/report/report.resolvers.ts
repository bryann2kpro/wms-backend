/**
 * Report GraphQL Resolvers
 *
 * @description Resolvers for generating report PDFs (Movement Report, Invoices Summary).
 */

import {
  getMovementReportData,
  getInvoiceSummaryData,
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
        };
      }
    ) => {
      const { type, dateFrom, dateTo } = args.input;

      if (type === 'MOVEMENT_REPORT') {
        const rows = getMovementReportData(dateFrom, dateTo);
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
